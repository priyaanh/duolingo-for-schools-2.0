/*
 * Processes student join requests dropped in the ntfy.sh inbox by the tracker
 * page (a student enters the class code + their username; the page posts
 * {u, h} to the topic). Requests whose h matches the class code hash are
 * validated against Duolingo and added to data/usernames.json. Reprocessing is
 * idempotent (already-listed names are skipped); inbox messages expire on
 * their own after ~12 hours.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";

const CONFIG_PATH = "data/usernames.json";
const MAX_USERS = 100;
const USERNAME_RE = /^[A-Za-z0-9._-]{2,30}$/;

const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
cfg.usernames = cfg.usernames || [];

let added = 0;
const report = [];

if (!cfg.joinTopic) {
  report.push("No joinTopic configured — nothing to process.");
} else {
  const res = await fetch(`https://ntfy.sh/${encodeURIComponent(cfg.joinTopic)}/json?poll=1&since=all`);
  if (!res.ok) throw new Error(`inbox poll failed: HTTP ${res.status}`);
  const text = await res.text();

  const wanted = new Map(); // lowercased username -> as-typed
  let wrongCode = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let payload = null;
    try {
      const msg = JSON.parse(line);
      if (msg.event === "message" && msg.message) payload = JSON.parse(msg.message);
    } catch { continue; }
    if (!payload || !payload.u) continue;
    const u = String(payload.u).trim().replace(/^@/, "");
    if (!USERNAME_RE.test(u)) continue;
    if (cfg.classCodeHash && Number(payload.h) !== cfg.classCodeHash) { wrongCode++; continue; }
    if (cfg.usernames.some((x) => String(x).toLowerCase() === u.toLowerCase())) continue; // already on the board
    wanted.set(u.toLowerCase(), u);
  }
  if (wrongCode) report.push(`🚫 ${wrongCode} request(s) ignored — wrong class code`);

  for (const name of wanted.values()) {
    if (cfg.usernames.length >= MAX_USERS) {
      report.push(`❌ **${name}** — the tracker list is full (${MAX_USERS})`);
      continue;
    }
    try {
      const url = `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(name)}&fields=users%7Busername,name,totalXp,streak%7D`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (classroom XP tracker; educational project)" }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const info = json.users && json.users[0];
      if (!info) {
        report.push(`❌ **${name}** — no public Duolingo profile found`);
      } else {
        const canonical = info.username || name;
        cfg.usernames.push(canonical);
        added++;
        report.push(`✅ **${canonical}** — joined with the class code! (${(info.totalXp ?? 0).toLocaleString("en-US")} XP, streak ${info.streak ?? 0})`);
      }
    } catch (err) {
      report.push(`⚠️ **${name}** — couldn't verify with Duolingo (${err.message}); will retry next run`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }

  if (added) await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
  if (!report.length) report.push("Inbox empty — nothing to do.");
}

const reportMd = report.map((l) => `- ${l}`).join("\n");
console.log(`added=${added}`);
console.log(reportMd.replace(/\*\*/g, ""));
if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Join requests\n\n${reportMd}\n`);
}
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `added=${added}\n`);
}
