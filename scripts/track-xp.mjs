/*
 * Records today's XP snapshot for every class member into data/xp-history.json.
 * Run by .github/workflows/track-xp.yml on a daily schedule (or by hand).
 *
 * Without a token (DUOLINGO_JWT unset) it records Duolingo's public-profile
 * numbers, which count language-course XP only. With a token it also records
 * each member's full Total XP (the app's number, including Math and Music) and
 * exact XP-per-day for the last two weeks, straight from Duolingo.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { publicProfile, checkToken, accountTotals, dailyXp, localDate, addDays, sleep } from "./duolingo.mjs";

const CONFIG_PATH = "data/usernames.json";
const HISTORY_PATH = "data/xp-history.json";
const DAILY_LOOKBACK_DAYS = 14;

const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const usernames = (cfg.usernames || []).map((u) => String(u).trim()).filter(Boolean);

let history;
try {
  history = JSON.parse(await readFile(HISTORY_PATH, "utf8"));
  if (!Array.isArray(history.snapshots)) history = { snapshots: [] };
} catch {
  history = { snapshots: [] };
}

// Label each snapshot with the Pacific-time day it represents: the nightly run
// fires just after midnight Pacific and records the day that just ended, so
// weeks close exactly at Sunday midnight. Any capture before 4 AM Pacific
// counts toward the previous day; a mid-day manual run is labeled with the
// current (partial) day and gets replaced by that night's full snapshot.
const today = localDate(-4 * 3600 * 1000);
const since = addDays(today, -(DAILY_LOOKBACK_DAYS - 1));

// The Duolingo login token, if the repo has one configured as a secret.
const jwt = (process.env.DUOLINGO_JWT || "").trim();
let token = null;
let tokenNote;
if (!jwt) {
  tokenNote = "No DUOLINGO_JWT secret is set — recording public-profile numbers (language-course XP only).";
} else {
  const t = await checkToken(jwt);
  if (t.ok) {
    token = jwt;
    tokenNote = `Duolingo token OK (account @${t.username}) — recording full Total XP and daily XP.`;
  } else {
    tokenNote = `Duolingo token not usable: ${t.reason}. Falling back to public-profile numbers.`;
  }
}
console.log(tokenNote);

const users = {};
const report = [];
let failures = 0;

for (const username of usernames) {
  try {
    const pub = await publicProfile(username);
    const entry = {
      name: pub.name,
      totalXp: pub.totalXp,
      publicXp: pub.totalXp,
      streak: pub.streak,
      source: "public-profile"
    };
    if (token) {
      const { best, notes } = await accountTotals(pub.id, token);
      if (best && best.totalXp >= pub.totalXp) {
        entry.totalXp = best.totalXp;
        if (typeof best.streak === "number") entry.streak = best.streak;
        entry.source = "duolingo-account";
      } else {
        console.error(`  account totals for ${username}: ${notes.join("; ")}`);
      }
      try {
        entry.daily = await dailyXp(pub.id, token, since, today);
        entry.source = "duolingo-account";
      } catch (e) {
        console.error(`  daily XP for ${username}: ${e.message} — weekly XP will use snapshot differences`);
      }
    }
    users[username] = entry;
    const days = entry.daily ? Object.keys(entry.daily).length : 0;
    console.log(`ok: ${username} — ${entry.totalXp} XP (${entry.source}${entry.publicXp !== entry.totalXp ? `; public profile shows ${entry.publicXp}` : ""}), streak ${entry.streak}${days ? `, ${days} days of daily XP` : ""}`);
    report.push(`| ${username} | ${entry.totalXp} | ${entry.publicXp} | ${entry.streak} | ${days ? "yes" : "no"} |`);
  } catch (err) {
    failures++;
    console.error(`skip: ${username} — ${err.message}`);
    report.push(`| ${username} | — | — | — | skipped: ${err.message} |`);
  }
  await sleep(1500); // be polite between requests
}

// One snapshot per day: re-running today replaces today's entry.
history.snapshots = history.snapshots.filter((s) => s.date !== today);
history.snapshots.push({ date: today, users });
history.snapshots.sort((a, b) => a.date.localeCompare(b.date));

await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
console.log(`Recorded ${Object.keys(users).length}/${usernames.length} profiles for ${today}.`);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## XP snapshot ${today}\n\n${tokenNote}\n\n| Username | Total XP | Public-profile XP | Streak | Daily XP |\n|---|---|---|---|---|\n${report.join("\n")}\n`
  );
}

if (usernames.length && Object.keys(users).length === 0) {
  console.error("Every fetch failed — Duolingo may be blocking this runner. Snapshot saved empty.");
  process.exitCode = 1;
}
