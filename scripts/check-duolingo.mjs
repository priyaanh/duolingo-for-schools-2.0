/*
 * Shows exactly what Duolingo reports for one or more usernames, so numbers on
 * the tracker can be checked against the app.
 *
 *   node scripts/check-duolingo.mjs priyaanh other_user
 *   DUOLINGO_JWT=<jwt_token cookie> node scripts/check-duolingo.mjs priyaanh
 *
 * Without a token: public-profile numbers (language-course XP only).
 * With a token: also the full Total XP and the last 14 days of XP per day.
 */
import { publicProfile, checkToken, accountTotals, dailyXp, localDate, addDays } from "./duolingo.mjs";

const names = process.argv.slice(2).map((s) => s.trim().replace(/^@/, "")).filter(Boolean);
if (!names.length) {
  console.log("usage: node scripts/check-duolingo.mjs <username> [more usernames]");
  process.exit(1);
}

const jwt = (process.env.DUOLINGO_JWT || "").trim();
let token = null;
if (jwt) {
  const t = await checkToken(jwt);
  if (t.ok) {
    token = jwt;
    console.log(`Token OK — logged in as @${t.username} (Total XP on that account: ${t.totalXp}).\n`);
  } else {
    console.log(`Token not usable: ${t.reason}\n`);
  }
} else {
  console.log("No DUOLINGO_JWT set — public-profile numbers only.\n");
}

const today = localDate();
const since = addDays(today, -13);

for (const name of names) {
  console.log(`=== @${name} ===`);
  let pub;
  try {
    pub = await publicProfile(name);
  } catch (e) {
    console.log(`  ${e.message}\n`);
    continue;
  }
  console.log(`  Public profile: ${pub.totalXp} XP in language courses, streak ${pub.streak}, id ${pub.id}`);
  for (const c of pub.courses) console.log(`    ${c.title.padEnd(14)} ${String(c.xp).padStart(7)} XP`);
  if (!token) {
    console.log("  (The app's Total XP also counts Math and Music XP, which this public view leaves out.)\n");
    continue;
  }
  const { best, notes } = await accountTotals(pub.id, token);
  console.log(`  Account record: ${best ? `${best.totalXp} Total XP (via ${best.source})` : "not available"}  [${notes.join("; ")}]`);
  try {
    const daily = await dailyXp(pub.id, token, since, today);
    const days = Object.keys(daily).sort();
    const week = days.filter((d) => d >= addDays(today, -6));
    console.log(`  XP per day (last ${days.length} days):`);
    for (const d of days) console.log(`    ${d}  ${String(daily[d]).padStart(6)}`);
    console.log(`  Last 7 days total: ${week.reduce((a, d) => a + daily[d], 0)} XP`);
  } catch (e) {
    console.log(`  XP per day: not available (${e.message})`);
  }
  console.log();
}
