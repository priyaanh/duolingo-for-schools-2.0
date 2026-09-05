/*
 * Batch-adds Duolingo usernames to the tracker list. Used by the
 * "Add students" workflow (owner pastes a list, no student accounts needed)
 * and runnable locally: node scripts/add-usernames.mjs name1 name2 ...
 * Each name is validated against Duolingo's public profile endpoint.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";

const CONFIG_PATH = "data/usernames.json";
const MAX_USERS = 100;
const USERNAME_RE = /^[A-Za-z0-9._-]{2,30}$/;

// Same hash as js/tracker.js — a classroom lock, not real security.
const codeHash = (s) => {
  let h = 5381;
  for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h;
};

const raw = process.env.USERNAMES || process.argv.slice(2).join(" ");
const classCode = (process.env.CLASS_CODE || "").trim();
const names = Array.from(
  new Set(
    raw
      .split(/[\s,;]+/)
      .map((s) => s.trim().replace(/^@/, ""))
      .filter(Boolean)
      .map((s) => s)
  )
);

if (!names.length && !classCode) {
  console.error("Nothing to do: pass usernames (arguments or $USERNAMES) and/or a class code ($CLASS_CODE).");
  process.exit(1);
}

const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
cfg.usernames = cfg.usernames || [];

const results = [];
let added = 0;

for (const name of names) {
  if (!USERNAME_RE.test(name)) {
    results.push(`❌ **${name}** — not a valid Duolingo username (letters, numbers, dots, dashes, underscores; 2-30 characters)`);
    continue;
  }
  if (cfg.usernames.some((u) => String(u).toLowerCase() === name.toLowerCase())) {
    results.push(`ℹ️ **${name}** — already on the tracker`);
    continue;
  }
  if (cfg.usernames.length >= MAX_USERS) {
    results.push(`❌ **${name}** — the tracker list is full (${MAX_USERS})`);
    continue;
  }
  try {
    const url = `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(name)}&fields=users%7Busername,name,totalXp,streak%7D`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (classroom XP tracker; educational project)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const info = json.users && json.users[0];
    if (!info) {
      results.push(`❌ **${name}** — no public Duolingo profile found (check the spelling; the profile must not be private)`);
    } else {
      const canonical = info.username || name;
      cfg.usernames.push(canonical);
      added++;
      results.push(`✅ **${canonical}** — added! (${(info.totalXp ?? 0).toLocaleString("en-US")} XP, streak ${info.streak ?? 0})`);
    }
  } catch (err) {
    results.push(`⚠️ **${name}** — couldn't reach Duolingo to verify (${err.message}); try this one again later`);
  }
  await new Promise((r) => setTimeout(r, 1200)); // be polite between requests
}

// Optional class code: sets (or removes, with "off") the code students must
// type before the tracker page shows the board.
let codeChanged = 0;
if (classCode) {
  const norm = classCode.toUpperCase();
  if (["OFF", "NONE", "REMOVE"].includes(norm)) {
    if (cfg.classCodeHash) { cfg.classCodeHash = null; codeChanged = 1; results.push("🔓 **class code** — removed (the board is open to anyone with the link)"); }
    else results.push("ℹ️ **class code** — none was set");
  } else {
    cfg.classCodeHash = codeHash(norm);
    codeChanged = 1;
    results.push(`🔒 **class code** — set to \`${norm}\` (students type it once per device)`);
  }
}

if (added || codeChanged) await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");

const report = results.map((r) => `- ${r}`).join("\n");
console.log(report.replace(/\*\*/g, ""));
console.log(`\n${added} added, ${names.length - added} skipped. Tracker list now has ${cfg.usernames.length} username(s).`);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `## Add students — results\n\n${report}\n\n**${added} added.** The tracker list now has ${cfg.usernames.length} username(s).\n`
  );
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `added=${added + codeChanged}\n`);
}
