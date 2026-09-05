/*
 * Handles "join: <username> [<username> ...]" issues (see .github/workflows/join.yml).
 * One issue can enroll a single student or a whole class: every name in the
 * title after "join:" is validated against Duolingo's public profile endpoint
 * and appended to data/usernames.json. A "teacher:name" token marks that person
 * as a teacher (added to the teachers list too). Emits status/added/report via
 * $GITHUB_OUTPUT for the workflow's reply comment.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";

const CONFIG_PATH = "data/usernames.json";
const MAX_USERS = 100;
const MAX_PER_ISSUE = 30;
const USERNAME_RE = /^[A-Za-z0-9._-]{2,30}$/;

const title = process.env.ISSUE_TITLE || "";
let status = "invalid";
let added = 0;
let changed = 0; // teacher promotions of already-tracked users
const report = [];

const match = title.match(/^\s*join\s*:\s*(.+?)\s*$/i);
if (!match) {
  report.push("The issue title must look like: `join: your_duolingo_username` — or several usernames separated by spaces or commas.");
} else {
  // Each token may carry a "teacher:" prefix that marks the person as a teacher.
  const parsed = Array.from(new Set(match[1].split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)))
    .slice(0, MAX_PER_ISSUE)
    .map((t) => ({ isTeacher: /^teacher:/i.test(t), name: t.replace(/^teacher:/i, "").replace(/^@/, "") }));
  const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  cfg.usernames = cfg.usernames || [];
  cfg.teachers = cfg.teachers || [];
  let exists = 0;

  const markTeacher = (canonical) => {
    if (!cfg.teachers.some((t) => String(t).toLowerCase() === canonical.toLowerCase())) {
      cfg.teachers.push(canonical);
      return true;
    }
    return false;
  };

  for (const { name, isTeacher } of parsed) {
    if (!USERNAME_RE.test(name)) {
      report.push(`❌ **${name}** — not a valid Duolingo username (letters, numbers, dots, dashes, underscores; 2-30 characters)`);
      continue;
    }
    const existing = cfg.usernames.find((u) => String(u).toLowerCase() === name.toLowerCase());
    if (existing) {
      if (isTeacher && markTeacher(existing)) {
        changed++;
        report.push(`🍎 **${existing}** — already tracked, now marked as teacher`);
      } else {
        exists++;
        report.push(`ℹ️ **${existing}** — already on the tracker`);
      }
      continue;
    }
    if (cfg.usernames.length >= MAX_USERS) {
      report.push(`❌ **${name}** — the tracker list is full (${MAX_USERS})`);
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
        report.push(`❌ **${name}** — no public Duolingo profile found (check the spelling; the profile must not be private)`);
      } else {
        const canonical = info.username || name;
        cfg.usernames.push(canonical);
        added++;
        const stats = `(${(info.totalXp ?? 0).toLocaleString("en-US")} XP, streak ${info.streak ?? 0})`;
        if (isTeacher) {
          markTeacher(canonical);
          report.push(`✅🍎 **${canonical}** — added as teacher! ${stats}`);
        } else {
          report.push(`✅ **${canonical}** — added! ${stats}`);
        }
      }
    } catch (err) {
      report.push(`⚠️ **${name}** — couldn't reach Duolingo to verify (${err.message}); try this one again later`);
    }
    await new Promise((r) => setTimeout(r, 1200)); // be polite between requests
  }

  if (added || changed) await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
  status = added || changed ? "added" : exists ? "exists" : "invalid";
}

const reportMd = report.map((l) => `- ${l}`).join("\n");
const changedTotal = added + changed;
console.log(`status=${status} added=${changedTotal}`);
console.log(reportMd.replace(/\*\*/g, ""));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `status=${status}\nadded=${changedTotal}\nreport<<__REPORT__\n${reportMd}\n__REPORT__\n`
  );
}
