/*
 * Fetches each class member's real Duolingo profile (public data only:
 * total XP and streak) and appends today's snapshot to data/xp-history.json.
 * Run by .github/workflows/track-xp.yml on a daily schedule.
 */
import { readFile, writeFile } from "node:fs/promises";

const CONFIG_PATH = "data/usernames.json";
const HISTORY_PATH = "data/xp-history.json";
const API = "https://www.duolingo.com/2017-06-30/users";

const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const usernames = (cfg.usernames || []).map((u) => String(u).trim()).filter(Boolean);

let history;
try {
  history = JSON.parse(await readFile(HISTORY_PATH, "utf8"));
  if (!Array.isArray(history.snapshots)) history = { snapshots: [] };
} catch {
  history = { snapshots: [] };
}

const today = new Date().toISOString().slice(0, 10);
const users = {};
let failures = 0;

for (const username of usernames) {
  const url = `${API}?username=${encodeURIComponent(username)}&fields=users%7Busername,name,totalXp,streak%7D`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (classroom XP tracker; educational project)" }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const info = json.users && json.users[0];
    if (!info) throw new Error("profile not found (check spelling / profile must be public)");
    users[username] = {
      name: info.name || username,
      totalXp: info.totalXp ?? 0,
      streak: info.streak ?? 0
    };
    console.log(`ok: ${username} — ${users[username].totalXp} XP, streak ${users[username].streak}`);
  } catch (err) {
    failures++;
    console.error(`skip: ${username} — ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 1500)); // be polite between requests
}

// One snapshot per day: re-running today replaces today's entry.
history.snapshots = history.snapshots.filter((s) => s.date !== today);
history.snapshots.push({ date: today, users });
history.snapshots.sort((a, b) => a.date.localeCompare(b.date));

await writeFile(HISTORY_PATH, JSON.stringify(history, null, 2) + "\n");
console.log(`Recorded ${Object.keys(users).length}/${usernames.length} profiles for ${today}.`);

if (usernames.length && Object.keys(users).length === 0) {
  console.error("Every fetch failed — Duolingo may be blocking this runner. Snapshot saved empty.");
  process.exitCode = 1;
}
