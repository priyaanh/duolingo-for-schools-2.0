/*
 * Handles "join: <username> [<username> ...]" issues (see .github/workflows/join.yml).
 * One issue can enroll a single student or a whole class: every name in the
 * title after "join:" is validated against Duolingo's public profile endpoint
 * and appended to data/usernames.json. Emits status/added/report via
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
const report = [];

const match = title.match(/^\s*join\s*:\s*(.+?)\s*$/i);
if (!match) {
  report.push("The issue title must look like: `join: your_duolingo_username` — or several usernames separated by spaces or commas.");
} else {
  const names = Array.from(
    new Set(match[1].split(/[\s,;]+/).map((s) => s.trim().replace(/^@/, "")).filter(Boolean))
  ).slice(0, MAX_PER_ISSUE);
  const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  cfg.usernames = cfg.usernames || [];
  let exists = 0;

  for (const name of names) {
    if (!USERNAME_RE.test(name)) {
      report.push(`❌ **${name}** — not a valid Duolingo username (letters, numbers, dots, dashes, underscores; 2-30 characters)`);
      continue;
    }
    if (cfg.usernames.some((u) => String(u).toLowerCase() === name.toLowerCase())) {
      exists++;
      report.push(`ℹ️ **${name}** — already on the tracker`);
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
        report.push(`✅ **${canonical}** — added! (${(info.totalXp ?? 0).toLocaleString("en-US")} XP, streak ${info.streak ?? 0})`);
      }
    } catch (err) {
      report.push(`⚠️ **${name}** — couldn't reach Duolingo to verify (${err.message}); try this one again later`);
    }
    await new Promise((r) => setTimeout(r, 1200)); // be polite between requests
  }

  if (added) await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
  status = added ? "added" : exists ? "exists" : "invalid";
}

const reportMd = report.map((l) => `- ${l}`).join("\n");
console.log(`status=${status} added=${added}`);
console.log(reportMd.replace(/\*\*/g, ""));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `status=${status}\nadded=${added}\nreport<<__REPORT__\n${reportMd}\n__REPORT__\n`
  );
}
