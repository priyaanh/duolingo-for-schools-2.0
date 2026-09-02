/*
 * Handles "join: <username>" issues (see .github/workflows/join.yml).
 * Reads the issue title from $ISSUE_TITLE, validates the username against
 * Duolingo's public profile endpoint, and appends it to data/usernames.json.
 * Emits status/username/xp/reason via $GITHUB_OUTPUT for the workflow to use.
 */
import { readFile, writeFile, appendFile } from "node:fs/promises";

const CONFIG_PATH = "data/usernames.json";
const MAX_USERS = 100;
const USERNAME_RE = /^[A-Za-z0-9._-]{2,30}$/;

const title = process.env.ISSUE_TITLE || "";
let status = "invalid";
let username = "";
let xp = 0;
let reason = "";

const match = title.match(/^\s*join\s*:\s*(.+?)\s*$/i);
if (!match) {
  reason = "The issue title must look like: `join: your_duolingo_username`";
} else {
  username = match[1].trim().replace(/^@/, "");
  if (!USERNAME_RE.test(username)) {
    reason = "That doesn't look like a valid Duolingo username (letters, numbers, dots, dashes, underscores; 2-30 characters).";
    username = "";
  } else {
    const cfg = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
    cfg.usernames = cfg.usernames || [];
    if (cfg.usernames.some((u) => String(u).toLowerCase() === username.toLowerCase())) {
      status = "exists";
    } else if (cfg.usernames.length >= MAX_USERS) {
      reason = `The tracker list is full (${MAX_USERS} usernames).`;
    } else {
      try {
        const url = `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(username)}&fields=users%7Busername,name,totalXp,streak%7D`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (classroom XP tracker; educational project)" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const info = json.users && json.users[0];
        if (!info) {
          reason = "No public Duolingo profile was found with that username — check the spelling, and make sure the profile isn't set to private (Duolingo → Settings → Privacy).";
        } else {
          username = info.username || username;
          xp = info.totalXp ?? 0;
          cfg.usernames.push(username);
          await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
          status = "added";
        }
      } catch (err) {
        reason = `Couldn't reach Duolingo to verify the username (${err.message}) — please try again in a few minutes.`;
      }
    }
  }
}

console.log(`status=${status} username=${username} xp=${xp}${reason ? ` reason=${reason}` : ""}`);
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `status=${status}\nusername=${username}\nxp=${xp}\nreason=${reason.replace(/\n/g, " ")}\n`
  );
}
