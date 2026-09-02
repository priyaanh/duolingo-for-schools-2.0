/*
 * Class XP tracker: renders weekly XP per student from the daily snapshots
 * that .github/workflows/track-xp.yml commits to data/xp-history.json.
 *
 * Self-serve joining: anyone can type their Duolingo username. The page tries
 * a live lookup (best-effort, via public CORS relays), and permanent enrollment
 * happens through a prefilled GitHub issue that .github/workflows/join.yml
 * turns into a commit — the page then polls until their data appears.
 */
"use strict";

const REPO = "priyaanh/duolingo-for-schools-2.0";
const MY_KEY = "dfs2-my-usernames";
const WATCH_KEY = "dfs2-watch-username";
const USERNAME_RE = /^[A-Za-z0-9._-]{2,30}$/;

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

/* -------------------- local memory of "my" usernames -------------------- */

function getMyUsernames() {
  try { return JSON.parse(localStorage.getItem(MY_KEY)) || []; } catch { return []; }
}
function rememberUsername(u) {
  try {
    const list = getMyUsernames();
    if (!list.some((x) => x.toLowerCase() === u.toLowerCase())) {
      list.push(u);
      localStorage.setItem(MY_KEY, JSON.stringify(list));
    }
  } catch { /* storage unavailable — fine */ }
}
const isMine = (u) => getMyUsernames().some((x) => x.toLowerCase() === String(u).toLowerCase());

/* -------------------- live profile lookup (best-effort) -------------------- */

const duoApiUrl = (u) =>
  `https://www.duolingo.com/2017-06-30/users?username=${encodeURIComponent(u)}&fields=users%7Busername,name,totalXp,streak%7D`;

// Direct first (in case CORS ever opens up), then public relays. All flaky —
// treat success as a bonus; permanent enrollment never depends on these.
const RELAYS = [
  (u) => u,
  (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}`
];

async function fetchProfile(username) {
  const target = duoApiUrl(username);
  let lastErr = null;
  for (const wrap of RELAYS) {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
      const res = await fetch(wrap(target), ctrl ? { signal: ctrl.signal } : {});
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const info = json.users && json.users[0];
      if (!info) { const e = new Error("not found"); e.notFound = true; throw e; }
      return info;
    } catch (e) {
      if (e && e.notFound) throw e; // a relay worked and Duolingo said "no such user"
      lastErr = e;
    }
  }
  const e = new Error("unreachable");
  e.unreachable = true;
  throw e;
}

/* -------------------- join box -------------------- */

const issueUrl = (u) =>
  `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`join: ${u}`)}` +
  `&body=${encodeURIComponent("Please add me to the class XP tracker. (This is automated — just press Submit new issue.)")}`;

function joinBoxHtml() {
  return `
    <div class="card" style="margin-bottom:20px;">
      <h2 style="font-weight:900;margin-bottom:4px;">➕ Add yourself to the tracker</h2>
      <p class="muted" style="font-weight:700;color:var(--ink-soft);font-size:14px;">
        Type your real Duolingo username. Profiles must not be set to private
        (Duolingo → Settings → Privacy).
      </p>
      <div class="form-row">
        <input id="join-username" placeholder="Your Duolingo username" maxlength="30" autocomplete="off" />
        <button class="btn small" id="join-lookup">Show my XP</button>
        <button class="btn blue small" id="join-enroll">Join the class tracker</button>
      </div>
      <div id="join-result"></div>
      <p style="font-weight:700;color:var(--ink-soft);font-size:13px;margin-top:8px;">
        <strong>No account needed:</strong> just give your Duolingo username to whoever runs this
        tracker — they paste it into the <em>Add students</em> button on GitHub and you're on within
        a minute. Already have a GitHub account? <strong>Join the class tracker</strong> files the
        request for you automatically instead.
      </p>
    </div>`;
}

function setJoinResult(html) {
  const el = document.getElementById("join-result");
  if (el) el.innerHTML = html;
}

function bindJoinBox(trackedLower) {
  const btn = document.getElementById("join-lookup");
  const enroll = document.getElementById("join-enroll");
  const input = document.getElementById("join-username");
  if (!btn || !btn.addEventListener || !input) return;

  const readUsername = () => {
    const u = String(input.value || "").trim().replace(/^@/, "");
    if (!USERNAME_RE.test(u)) {
      setJoinResult(`<p style="color:var(--red);font-weight:800;">Please enter a valid Duolingo username (letters, numbers, dots, dashes, underscores).</p>`);
      return null;
    }
    return u;
  };

  btn.addEventListener("click", async () => {
    const u = readUsername();
    if (!u) return;
    btn.disabled = true;
    setJoinResult(`<p class="muted" style="font-weight:700;">Looking up @${escT(u)}…</p>`);
    try {
      const info = await fetchProfile(u);
      const name = info.username || u;
      rememberUsername(name);
      const already = trackedLower.has(name.toLowerCase());
      setJoinResult(`
        <div style="border:2px solid var(--green);background:var(--green-pale);border-radius:12px;padding:14px;font-weight:800;">
          🎉 <strong>${escT(info.name || name)}</strong> <span style="color:var(--ink-soft)">@${escT(name)}</span>
          — ⚡ ${fmt(info.totalXp ?? 0)} total XP · 🔥 ${fmt(info.streak ?? 0)} day streak
          ${already
            ? `<div style="margin-top:6px;">✅ Already on the class tracker below.</div>`
            : `<div style="margin-top:6px;">Not on the class tracker yet — give this username to whoever runs the tracker (no account needed), or press <strong>Join the class tracker</strong> if you have a GitHub account.</div>`}
        </div>`);
      addLiveRow(info, trackedLower);
    } catch (e) {
      if (e && e.notFound) {
        setJoinResult(`<p style="color:var(--red);font-weight:800;">No public Duolingo profile called “${escT(u)}” was found — check the spelling, and make sure the profile isn't private.</p>`);
      } else {
        setJoinResult(`<p class="muted" style="font-weight:700;">Live preview isn't available right now (the free relay services this page uses are down). You can still be added: give your username to whoever runs the tracker (no account needed), or press <strong>Join the class tracker</strong> if you have a GitHub account — your XP shows up here about a minute later either way.</p>`);
      }
    } finally {
      btn.disabled = false;
    }
  });

  if (enroll && enroll.addEventListener) {
    enroll.addEventListener("click", () => {
      const u = readUsername();
      if (!u) return;
      rememberUsername(u);
      if (trackedLower.has(u.toLowerCase())) {
        setJoinResult(`<p style="font-weight:800;color:var(--green-dark);">✅ @${escT(u)} is already being tracked — look for the row below!</p>`);
        return;
      }
      window.open(issueUrl(u), "_blank");
      startWatch(u);
    });
  }

  if (input.addEventListener) {
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
  }
}

/* -------------------- waiting for the join robot -------------------- */

function startWatch(username) {
  try { localStorage.setItem(WATCH_KEY, username); } catch { /* fine */ }
  setJoinResult(`
    <p style="font-weight:800;color:var(--blue-dark);">
      ⏳ Waiting for <strong>@${escT(username)}</strong> to be added… after you submit the GitHub issue,
      a robot enrolls you and this page refreshes itself (checking every 20 seconds).
    </p>`);
  const iv = setInterval(async () => {
    try {
      const h = await loadJson("data/xp-history.json");
      const snaps = h.snapshots || [];
      const latest = snaps[snaps.length - 1];
      if (latest && Object.keys(latest.users || {}).some((u) => u.toLowerCase() === username.toLowerCase())) {
        clearInterval(iv);
        try { localStorage.removeItem(WATCH_KEY); } catch { /* fine */ }
        location.reload();
      }
    } catch { /* transient fetch problem — keep polling */ }
  }, 20000);
}

function resumeWatchIfPending(trackedLower) {
  let pending = null;
  try { pending = localStorage.getItem(WATCH_KEY); } catch { return; }
  if (!pending) return;
  if (trackedLower.has(pending.toLowerCase())) {
    try { localStorage.removeItem(WATCH_KEY); } catch { /* fine */ }
  } else {
    startWatch(pending);
  }
}

/* -------------------- live (not-yet-enrolled) rows -------------------- */

function addLiveRow(info, trackedLower) {
  const body = document.getElementById("leaderboard-body");
  if (!body || !body.insertAdjacentHTML) return;
  const name = info.username || "";
  if (trackedLower.has(name.toLowerCase())) return;
  if (document.querySelector(`[data-live-user="${name.toLowerCase()}"]`)) return;
  body.insertAdjacentHTML("beforeend", `
    <tr data-live-user="${escT(name.toLowerCase())}">
      <td>📡 <strong>${escT(info.name || name)}</strong> <span class="muted">@${escT(name)}</span>
        <span class="chip pending">live · not enrolled yet</span></td>
      <td class="cell-warn">—</td>
      <td>—</td>
      <td>${fmt(info.totalXp ?? 0)}</td>
      <td>🔥 ${fmt(info.streak ?? 0)}</td>
    </tr>`);
}

async function renderLiveRows(trackedLower) {
  for (const u of getMyUsernames()) {
    if (trackedLower.has(u.toLowerCase())) continue;
    try { addLiveRow(await fetchProfile(u), trackedLower); } catch { /* best-effort only */ }
  }
}

/* -------------------- setup help -------------------- */

function setupHelp(reason) {
  return `
    <div class="card setup">
      <h2 style="font-weight:900;margin-bottom:6px;">🛠 Almost there!</h2>
      <p class="muted">${escT(reason)}</p>
      <ol>
        <li>Use the <strong>Add yourself</strong> box above, or edit <code>data/usernames.json</code> in the repo to list everyone's real Duolingo usernames (profiles must not be set to private).</li>
        <li>On GitHub, open the <strong>Actions</strong> tab and enable workflows if asked.</li>
        <li>Run the <strong>Track Duolingo XP</strong> workflow once by hand (Run workflow ▸ main). After that it runs automatically every day at 06:00 UTC.</li>
        <li>Refresh this page — weekly XP appears as soon as the first snapshot is committed.</li>
      </ol>
    </div>`;
}

/* -------------------- main render -------------------- */

function render(cfg, history) {
  const root = document.getElementById("tracker-root");
  const usernames = (cfg.usernames || []).filter(Boolean);
  const snaps = (history.snapshots || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((s) => s.users && Object.keys(s.users).length);

  const head = `<div class="page-head"><h1>📈 Class XP Tracker</h1>` +
    (snaps.length
      ? `<span class="sub">Real Duolingo XP, snapshotted daily · last update: <strong>${escT(snaps[snaps.length - 1].date)}</strong> · weeks start on Monday (UTC)</span>`
      : "") +
    `</div>`;

  if (!snaps.length) {
    const reason = usernames.length
      ? `${usernames.length} username${usernames.length === 1 ? " is" : "s are"} configured, but no snapshots have been recorded yet.`
      : "No Duolingo usernames are configured yet, so there is nothing to track.";
    root.innerHTML = head + joinBoxHtml() + setupHelp(reason);
    const emptySet = new Set(usernames.map((u) => u.toLowerCase()));
    bindJoinBox(emptySet);
    resumeWatchIfPending(emptySet);
    return;
  }

  // Every user ever seen in a snapshot, plus configured ones not yet fetched.
  const seen = new Set();
  snaps.forEach((s) => Object.keys(s.users).forEach((u) => seen.add(u)));
  const allUsers = Array.from(new Set([...seen, ...usernames]));
  const trackedLower = new Set(allUsers.map((u) => u.toLowerCase()));

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
      const mine = isMine(r.username) ? "⭐ " : "";
      return `
        <tr class="${r.thisWeek === bestThisWeek && bestThisWeek > 0 ? "best" : ""}">
          <td>${medal} ${mine}<strong>${escT(r.name)}</strong> <span class="muted">@${escT(r.username)}</span></td>
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
    ${head}
    ${joinBoxHtml()}

    <div class="stat-row">
      <div class="stat"><div class="num">⚡ ${fmt(classThisWeek)}</div><div class="lbl">Class XP this week</div></div>
      <div class="stat"><div class="num">${rows.filter((r) => r.tracked).length}/${allUsers.length}</div><div class="lbl">Profiles tracked</div></div>
      <div class="stat"><div class="num">${snaps.length}</div><div class="lbl">Daily snapshots</div></div>
      <div class="stat"><div class="num">${weeks.length}</div><div class="lbl">Weeks recorded</div></div>
    </div>

    <h2 class="section-title">🏆 This week's leaderboard</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Student</th><th>This week</th><th>Last week</th><th>Total XP</th><th>Streak</th></tr></thead>
      <tbody id="leaderboard-body">${leaderboard}</tbody>
    </table></div>

    <h2 class="section-title">🗓 Weekly history (XP gained)</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Student</th>${historyHead}</tr></thead>
      <tbody>
        ${historyRows}
        <tr><td><strong>Class total</strong></td>${historyTotals}</tr>
      </tbody>
    </table></div>`;

  bindJoinBox(trackedLower);
  resumeWatchIfPending(trackedLower);
  renderLiveRows(trackedLower);
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
