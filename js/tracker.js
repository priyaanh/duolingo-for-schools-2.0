/*
 * Class XP tracker: renders weekly XP per student from the daily snapshots
 * that .github/workflows/track-xp.yml commits to data/xp-history.json.
 */
"use strict";

const escT = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const fmt = (n) => n.toLocaleString("en-US");

// Monday of the week containing dateStr (all math in UTC to avoid TZ drift)
function weekStart(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

function weekLabel(startStr) {
  const [y, m, d] = startStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `Week of ${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

async function loadJson(path) {
  const res = await fetch(`${path}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function setupHelp(reason) {
  return `
    <div class="card setup">
      <h2 style="font-weight:900;margin-bottom:6px;">🛠 Almost there!</h2>
      <p class="muted">${escT(reason)}</p>
      <ol>
        <li>Edit <code>data/usernames.json</code> in the repo and list everyone's real Duolingo username (profiles must not be set to private).</li>
        <li>On GitHub, open the <strong>Actions</strong> tab and enable workflows if asked.</li>
        <li>Run the <strong>Track Duolingo XP</strong> workflow once by hand (Run workflow ▸ main). After that it runs automatically every day at 06:00 UTC.</li>
        <li>Refresh this page — weekly XP appears as soon as the first snapshot is committed.</li>
      </ol>
    </div>`;
}

function render(cfg, history) {
  const root = document.getElementById("tracker-root");
  const usernames = (cfg.usernames || []).filter(Boolean);
  const snaps = (history.snapshots || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((s) => s.users && Object.keys(s.users).length);

  if (!usernames.length && !snaps.length) {
    root.innerHTML = `<div class="page-head"><h1>📈 Class XP Tracker</h1></div>` +
      setupHelp("No Duolingo usernames are configured yet, so there is nothing to track.");
    return;
  }
  if (!snaps.length) {
    root.innerHTML = `<div class="page-head"><h1>📈 Class XP Tracker</h1></div>` +
      setupHelp(`${usernames.length} username${usernames.length === 1 ? " is" : "s are"} configured, but no snapshots have been recorded yet.`);
    return;
  }

  // Every user ever seen in a snapshot, plus configured ones not yet fetched.
  const seen = new Set();
  snaps.forEach((s) => Object.keys(s.users).forEach((u) => seen.add(u)));
  const allUsers = Array.from(new Set([...seen, ...usernames]));

  const latest = snaps[snaps.length - 1];
  const weeks = Array.from(new Set(snaps.map((s) => weekStart(s.date)))).sort();
  const lastSnapOfWeek = {};
  const firstSnapOfWeekWithUser = {}; // per week, per user: first totalXp seen inside that week
  snaps.forEach((s) => {
    const w = weekStart(s.date);
    lastSnapOfWeek[w] = s; // snaps are date-sorted, so this ends at the week's last snapshot
    firstSnapOfWeekWithUser[w] = firstSnapOfWeekWithUser[w] || {};
    Object.entries(s.users).forEach(([u, info]) => {
      if (!(u in firstSnapOfWeekWithUser[w])) firstSnapOfWeekWithUser[w][u] = info.totalXp;
    });
  });

  // XP gained by user u during week w:
  //   end   = totalXp in the week's last snapshot that includes u
  //   start = totalXp in the last snapshot of any earlier week that includes u,
  //           else the first in-week value (covers the very first tracked week)
  function weeklyGain(u, w) {
    const endSnap = lastSnapOfWeek[w];
    if (!endSnap || !(u in endSnap.users)) return null;
    const end = endSnap.users[u].totalXp;
    let start = null;
    for (let i = weeks.indexOf(w) - 1; i >= 0; i--) {
      const prev = lastSnapOfWeek[weeks[i]];
      if (prev && u in prev.users) { start = prev.users[u].totalXp; break; }
    }
    if (start === null) start = firstSnapOfWeekWithUser[w][u];
    if (start === null || start === undefined) return null;
    return Math.max(0, end - start);
  }

  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;

  const rows = allUsers
    .map((u) => {
      const info = latest.users[u];
      return {
        username: u,
        name: info ? info.name : u,
        tracked: !!info,
        totalXp: info ? info.totalXp : null,
        streak: info ? info.streak : null,
        thisWeek: weeklyGain(u, thisWeek),
        lastWeek: lastWeek ? weeklyGain(u, lastWeek) : null
      };
    })
    .sort((a, b) => (b.thisWeek ?? -1) - (a.thisWeek ?? -1));

  const bestThisWeek = Math.max(0, ...rows.map((r) => r.thisWeek ?? 0));
  const classThisWeek = rows.reduce((a, r) => a + (r.thisWeek || 0), 0);

  const leaderboard = rows
    .map((r, i) => {
      if (!r.tracked)
        return `<tr><td>❓ <strong>${escT(r.username)}</strong></td><td colspan="4" class="muted">not found yet — check the username spelling and that the profile isn't private</td></tr>`;
      const medal = i === 0 && (r.thisWeek || 0) > 0 ? "🥇" : i === 1 && (r.thisWeek || 0) > 0 ? "🥈" : i === 2 && (r.thisWeek || 0) > 0 ? "🥉" : "";
      return `
        <tr class="${r.thisWeek === bestThisWeek && bestThisWeek > 0 ? "best" : ""}">
          <td>${medal} <strong>${escT(r.name)}</strong> <span class="muted">@${escT(r.username)}</span></td>
          <td class="${(r.thisWeek || 0) > 0 ? "cell-good" : "cell-warn"}">${r.thisWeek === null ? "—" : "⚡ " + fmt(r.thisWeek)}</td>
          <td>${r.lastWeek === null ? "—" : "⚡ " + fmt(r.lastWeek)}</td>
          <td>${fmt(r.totalXp)}</td>
          <td>🔥 ${fmt(r.streak)}</td>
        </tr>`;
    })
    .join("");

  const historyWeeks = weeks.slice(-8);
  const historyHead = historyWeeks.map((w) => `<th>${escT(weekLabel(w))}</th>`).join("");
  const historyRows = allUsers
    .map((u) => {
      const info = latest.users[u];
      const cells = historyWeeks
        .map((w) => {
          const g = weeklyGain(u, w);
          return `<td class="${g ? "cell-good" : "cell-warn"}">${g === null ? "—" : fmt(g)}</td>`;
        })
        .join("");
      return `<tr><td><strong>${escT(info ? info.name : u)}</strong></td>${cells}</tr>`;
    })
    .join("");
  const historyTotals = historyWeeks
    .map((w) => `<td><strong>${fmt(allUsers.reduce((a, u) => a + (weeklyGain(u, w) || 0), 0))}</strong></td>`)
    .join("");

  root.innerHTML = `
    <div class="page-head">
      <h1>📈 Class XP Tracker</h1>
      <span class="sub">Real Duolingo XP, snapshotted daily · last update: <strong>${escT(latest.date)}</strong> · weeks start on Monday (UTC)</span>
    </div>

    <div class="stat-row">
      <div class="stat"><div class="num">⚡ ${fmt(classThisWeek)}</div><div class="lbl">Class XP this week</div></div>
      <div class="stat"><div class="num">${rows.filter((r) => r.tracked).length}/${allUsers.length}</div><div class="lbl">Profiles tracked</div></div>
      <div class="stat"><div class="num">${snaps.length}</div><div class="lbl">Daily snapshots</div></div>
      <div class="stat"><div class="num">${weeks.length}</div><div class="lbl">Weeks recorded</div></div>
    </div>

    <h2 class="section-title">🏆 This week's leaderboard</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Student</th><th>This week</th><th>Last week</th><th>Total XP</th><th>Streak</th></tr></thead>
      <tbody>${leaderboard}</tbody>
    </table></div>

    <h2 class="section-title">🗓 Weekly history (XP gained)</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Student</th>${historyHead}</tr></thead>
      <tbody>
        ${historyRows}
        <tr><td><strong>Class total</strong></td>${historyTotals}</tr>
      </tbody>
    </table></div>`;
}

(async () => {
  const root = document.getElementById("tracker-root");
  try {
    const [cfg, history] = await Promise.all([loadJson("data/usernames.json"), loadJson("data/xp-history.json")]);
    render(cfg, history);
  } catch (err) {
    root.innerHTML = `<div class="page-head"><h1>📈 Class XP Tracker</h1></div>` +
      setupHelp(`Couldn't load tracker data (${err.message}). If you're opening this file directly from disk, serve it instead (python3 -m http.server) or use the GitHub Pages link.`);
  }
})();
