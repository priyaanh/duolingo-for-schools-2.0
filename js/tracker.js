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

// Link a display name to the person's real Duolingo profile page.
const profileLink = (username, inner) =>
  `<a class="profile-link" href="https://www.duolingo.com/profile/${encodeURIComponent(username)}" target="_blank" rel="noopener" title="Open @${escT(username)}'s real Duolingo profile">${inner}</a>`;

const fmt = (n) => n.toLocaleString("en-US");

// Weeks run Monday 00:00 through Sunday 23:59 in this timezone; snapshot dates
// are already labeled with the Pacific day they represent (see track-xp.mjs).
const TIMEZONE = "America/Los_Angeles";
const todayLocal = () => new Date().toLocaleDateString("en-CA", { timeZone: TIMEZONE });

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Monday of the week containing dateStr (pure calendar math on the label)
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

/* -------------------- CSV export (for a teacher's gradebook) -------------------- */

function toCsv(rows2d) {
  return rows2d
    .map((r) => r.map((cell) => {
      const s = String(cell == null ? "" : cell);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
    .join("\r\n");
}

function downloadCsv(filename, text) {
  try {
    const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }); // BOM so Excel reads accents
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    /* download blocked — nothing else to do on a static page */
  }
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

/* -------------------- device-local class (no GitHub, no accounts) -------------------- */

const LOCAL_CLASS_KEY = "dfs2-local-class";

function getLocalClass() {
  try { return JSON.parse(localStorage.getItem(LOCAL_CLASS_KEY)) || {}; } catch { return {}; }
}
function saveLocalClass(map) {
  try { localStorage.setItem(LOCAL_CLASS_KEY, JSON.stringify(map)); } catch { /* fine */ }
}

function localClassBoardHtml() {
  const entries = Object.values(getLocalClass());
  if (!entries.length) return "";
  const students = entries.filter((e) => !e.isTeacher && typeof e.totalXp === "number").sort((a, b) => b.totalXp - a.totalXp);
  const pending = entries.filter((e) => !e.isTeacher && typeof e.totalXp !== "number");
  const teachers = entries.filter((e) => e.isTeacher);

  const roleBtn = (e) =>
    `<button class="linkish" data-local-teacher="${escT(e.username.toLowerCase())}" title="${e.isTeacher ? "Move to students" : "Mark as the teacher"}">${e.isTeacher ? "🎒 Make student" : "🍎 Make teacher"}</button>`;
  const removeBtn = (e) =>
    `<button class="linkish" data-local-remove="${escT(e.username.toLowerCase())}" title="Remove ${escT(e.username)}">✕</button>`;
  const xpCell = (e) => (typeof e.totalXp === "number" ? `⚡ ${fmt(e.totalXp)}` : "—");
  const streakCell = (e) => (typeof e.streak === "number" ? `🔥 ${fmt(e.streak)}` : "");

  const studentRows = students
    .map(
      (e, i) => `
      <div class="lb-row">
        <span class="rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
        <span class="nm">${profileLink(e.username, escT(e.name || e.username))} <span class="muted">@${escT(e.username)}</span></span>
        <span class="val">${xpCell(e)}</span>
        <span style="font-weight:800;">${streakCell(e)}</span>
        ${roleBtn(e)}${removeBtn(e)}
      </div>`
    )
    .join("");
  const pendingRows = pending
    .map(
      (e) => `
      <div class="lb-row">
        <span class="rank">…</span>
        <span class="nm">${escT(e.username)} <span class="muted">looking up XP…</span></span>
        <span class="val">—</span><span></span>
        ${roleBtn(e)}${removeBtn(e)}
      </div>`
    )
    .join("");
  const teacherRows = teachers
    .map(
      (e) => `
      <div class="lb-row">
        <span class="rank">🍎</span>
        <span class="nm">${profileLink(e.username, escT(e.name || e.username))} <span class="muted">@${escT(e.username)}</span> <span class="chip done">Teacher</span></span>
        <span class="val">${xpCell(e)}</span>
        <span style="font-weight:800;">${streakCell(e)}</span>
        ${roleBtn(e)}${removeBtn(e)}
      </div>`
    )
    .join("");

  let html = "";
  if (studentRows || pendingRows) html += `<div class="lb-list">${studentRows}${pendingRows}</div>`;
  if (teacherRows)
    html += `<p class="muted" style="font-weight:800;font-size:13px;margin:12px 0 4px;">👩‍🏫 Teachers (not ranked with students)</p><div class="lb-list">${teacherRows}</div>`;
  return html;
}

function localClassPanelHtml() {
  const has = Object.keys(getLocalClass()).length > 0;
  return `
    <details class="card collapser" id="local-class" ${has ? "open" : ""} style="margin-bottom:20px;border-color:var(--green);">
      <summary>👩‍🏫 Teacher: add your class — no GitHub, no accounts</summary>
      <p class="muted" style="font-weight:700;font-size:14px;margin-top:10px;">
        Paste your students' Duolingo usernames. Their <strong>real</strong> XP is looked up and shown right
        here, saved on this device — perfect for your own screen or projecting in class.
        To add the teacher, put <strong>teacher:</strong> in front of their name
        (e.g. <code>teacher:msdiaz</code>) — or tap <strong>🍎 Make teacher</strong> on any row later.
        Teachers get a badge and sit out of the student ranking.
      </p>
      <div class="form-row">
        <input id="local-add-input" placeholder="e.g. maria_g juanp alex.duo" style="flex:1;min-width:230px;" autocomplete="off" />
        <button class="btn small" id="local-add-btn">Add &amp; get XP</button>
      </div>
      <div id="local-add-status"></div>
      <div id="local-class-board" style="margin-top:12px;">${localClassBoardHtml()}</div>
      ${has
        ? `<div class="form-row" style="margin-top:12px;">
             <button class="btn ghost small" id="local-refresh">🔄 Refresh XP</button>
             <button class="btn ghost small" id="local-share">📢 Share with the whole class</button>
             <button class="linkish" id="local-clear">Clear this device's list</button>
           </div>
           <p class="muted" style="font-size:12px;font-weight:700;">
             Saved on <strong>this device only</strong>. To let students see it too (and build weekly history),
             tap <strong>Share with the whole class</strong> — that adds them to the shared tracker (needs GitHub once).
           </p>`
        : ""}
    </details>`;
}

async function fetchLocalXp(names, statusEl) {
  const valid = names.filter((n) => USERNAME_RE.test(n));
  let ok = 0, fail = 0;
  for (let i = 0; i < valid.length; i++) {
    const n = valid[i];
    if (statusEl) statusEl.innerHTML = `<p class="muted" style="font-weight:700;">Looking up @${escT(n)} (${i + 1} of ${valid.length})…</p>`;
    try {
      const info = await fetchProfile(n);
      const m = getLocalClass();
      // Merge so a teacher flag set on the pending row survives the XP fetch.
      m[n.toLowerCase()] = { ...(m[n.toLowerCase()] || {}), username: info.username || n, name: info.name || n, totalXp: info.totalXp ?? 0, streak: info.streak ?? 0, ts: Date.now() };
      saveLocalClass(m);
      ok++;
    } catch (e) {
      fail++;
    }
  }
  return { ok, fail };
}

function refreshLocalPanel() {
  const el = document.getElementById("local-class");
  if (el) el.outerHTML = localClassPanelHtml();
  bindLocalClass();
}

function bindLocalClass() {
  const addBtn = document.getElementById("local-add-btn");
  const input = document.getElementById("local-add-input");
  if (!addBtn || !addBtn.addEventListener || !input) return;

  if (typeof document.querySelectorAll === "function") {
    document.querySelectorAll("[data-local-remove]").forEach((el) =>
      el.addEventListener("click", () => {
        const map = getLocalClass();
        delete map[el.getAttribute("data-local-remove")];
        saveLocalClass(map);
        refreshLocalPanel();
      })
    );
    document.querySelectorAll("[data-local-teacher]").forEach((el) =>
      el.addEventListener("click", () => {
        const map = getLocalClass();
        const key = el.getAttribute("data-local-teacher");
        if (map[key]) { map[key].isTeacher = !map[key].isTeacher; saveLocalClass(map); refreshLocalPanel(); }
      })
    );
  }

  const addNames = async () => {
    const status = document.getElementById("local-add-status");
    // A "teacher:" prefix (e.g. "teacher:msdiaz") marks that person as the teacher.
    const tokens = Array.from(new Set(String(input.value || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)));
    const parsed = tokens.map((t) => ({
      isTeacher: /^teacher:/i.test(t),
      username: t.replace(/^teacher:/i, "").replace(/^@/, "")
    }));
    const valid = parsed.filter((p) => USERNAME_RE.test(p.username));
    const skipped = parsed.length - valid.length;
    if (!valid.length) {
      if (status) status.innerHTML = `<p style="color:var(--red);font-weight:800;">Enter at least one valid Duolingo username.</p>`;
      return;
    }
    const map = getLocalClass();
    valid.forEach((p) => {
      const k = p.username.toLowerCase();
      if (!map[k]) map[k] = { username: p.username };
      if (p.isTeacher) map[k].isTeacher = true;
    });
    saveLocalClass(map);
    input.value = "";
    refreshLocalPanel(); // show pending rows immediately
    const { ok, fail } = await fetchLocalXp(valid.map((p) => p.username), document.getElementById("local-add-status"));
    refreshLocalPanel();
    const teacherCount = valid.filter((p) => p.isTeacher).length;
    const s = document.getElementById("local-add-status");
    if (s)
      s.innerHTML = `<p style="font-weight:800;color:${ok ? "var(--green-dark)" : "var(--red)"};">Added ${ok}${teacherCount ? ` (${teacherCount} as teacher)` : ""}${fail ? `, ${fail} couldn't be looked up right now (tap 🔄 Refresh XP to retry)` : ""}${skipped ? `, ${skipped} skipped as invalid` : ""}.</p>`;
  };

  addBtn.addEventListener("click", addNames);
  if (input.addEventListener) input.addEventListener("keydown", (e) => { if (e.key === "Enter") addNames(); });

  const refreshBtn = document.getElementById("local-refresh");
  if (refreshBtn && refreshBtn.addEventListener)
    refreshBtn.addEventListener("click", async () => {
      const names = Object.values(getLocalClass()).map((e) => e.username);
      await fetchLocalXp(names, document.getElementById("local-add-status"));
      refreshLocalPanel();
    });

  const shareBtn = document.getElementById("local-share");
  if (shareBtn && shareBtn.addEventListener)
    shareBtn.addEventListener("click", () => {
      const names = Object.values(getLocalClass()).map((e) => e.username);
      if (names.length) window.open(issueUrl(names.join(" ")), "_blank");
    });

  const clearBtn = document.getElementById("local-clear");
  if (clearBtn && clearBtn.addEventListener)
    clearBtn.addEventListener("click", () => {
      if (typeof confirm === "function" && !confirm("Clear the class list saved on this device?")) return;
      saveLocalClass({});
      refreshLocalPanel();
    });
}

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

function joinBoxHtml(forceOpen = false) {
  let watchPending = false;
  try { watchPending = !!localStorage.getItem(WATCH_KEY); } catch { /* fine */ }
  return `
    <details class="card collapser" id="join-details" style="margin-bottom:20px;" ${forceOpen || watchPending ? "open" : ""}>
      <summary>➕ Add to the shared tracker (everyone sees it)</summary>
      <p class="muted" style="font-weight:700;color:var(--ink-soft);font-size:14px;margin-top:10px;">
        Use this to put people on the <strong>shared</strong> tracker — visible to the whole class on
        any device, with weekly history. It submits through GitHub (a free account is needed to press
        Submit). Just want a quick list on your own screen? Use the green box above instead.
        Profiles must not be private (Duolingo → Settings → Privacy).
      </p>
      <div class="form-row">
        <input id="join-username" placeholder="Your Duolingo username" maxlength="30" autocomplete="off" />
        <button class="btn small" id="join-lookup">Show my XP</button>
        <button class="btn blue small" id="join-enroll">Join the class tracker</button>
      </div>
      <div id="join-result"></div>
      <p style="font-weight:700;color:var(--ink-soft);font-size:13px;margin-top:8px;">
        <strong>No account needed:</strong> just give your Duolingo username to whoever runs this
        tracker. Already have a GitHub account? <strong>Join the class tracker</strong> files the
        request for you automatically instead.
      </p>
      <hr style="border:none;border-top:2px solid var(--line);margin:14px 0;" />
      <p style="font-weight:800;font-size:14px;">👩‍🏫 Adding the whole class at once?</p>
      <div class="form-row">
        <input id="join-bulk" placeholder="e.g. teacher:msdiaz maria_g juanp alex.duo" style="flex:1;min-width:230px;" />
        <button class="btn small" id="join-bulk-btn">Add the whole class</button>
      </div>
      <p style="font-weight:700;color:var(--ink-soft);font-size:12px;">
        Opens one prefilled GitHub request with every name — the robot checks each one against
        Duolingo and replies with a per-name report. Put <strong>teacher:</strong> in front of the
        teacher's name (e.g. <code>teacher:msdiaz</code>) to add them as the teacher.
      </p>
    </details>`;
}

function setJoinResult(html) {
  const el = document.getElementById("join-result");
  if (el) el.innerHTML = html;
  const box = document.getElementById("join-details");
  if (box) box.open = true;
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
          🎉 <strong>${profileLink(name, escT(info.name || name))}</strong> <span style="color:var(--ink-soft)">@${escT(name)}</span>
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

  const bulkBtn = document.getElementById("join-bulk-btn");
  const bulkInput = document.getElementById("join-bulk");
  if (bulkBtn && bulkBtn.addEventListener && bulkInput) {
    const submitBulk = () => {
      // A "teacher:" prefix is kept on the token so the robot marks that person a teacher.
      const tokens = Array.from(new Set(String(bulkInput.value || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)));
      const parsed = tokens.map((t) => ({ isTeacher: /^teacher:/i.test(t), username: t.replace(/^teacher:/i, "").replace(/^@/, "") }));
      const valid = parsed.filter((p) => USERNAME_RE.test(p.username));
      if (!valid.length) {
        setJoinResult(`<p style="color:var(--red);font-weight:800;">Paste at least one valid Duolingo username (separated by spaces or commas).</p>`);
        return;
      }
      const skipped = tokens.length - valid.length;
      const title = valid.map((p) => (p.isTeacher ? `teacher:${p.username}` : p.username)).join(" ");
      window.open(issueUrl(title), "_blank");
      valid.forEach((p) => rememberUsername(p.username));
      startWatch(valid[0].username);
      const teacherCount = valid.filter((p) => p.isTeacher).length;
      setJoinResult(`
        <p style="font-weight:800;color:var(--blue-dark);">
          ⏳ Submitting ${valid.length} username${valid.length === 1 ? "" : "s"}${teacherCount ? ` (${teacherCount} as teacher)` : ""}${skipped ? ` (${skipped} skipped as invalid)` : ""} —
          press <strong>Submit new issue</strong> on the GitHub page that just opened, and this page
          will refresh itself when the robot finishes.
        </p>`);
    };
    bulkBtn.addEventListener("click", submitBulk);
    if (bulkInput.addEventListener) bulkInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submitBulk(); });
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
      <td>📡 <strong>${profileLink(name, escT(info.name || name))}</strong> <span class="muted">@${escT(name)}</span>
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

/* -------------------- daily XP chart -------------------- */

function niceCeil(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

const shortDay = (dateStr) => {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}/${d}`;
};

// Class XP earned per day (sum of per-student gains between consecutive
// snapshots), last 14 days, as a single-series bar chart. The weekly history
// table below is the accessible table view of the same data.
function dailyChartHtml(snaps) {
  if (snaps.length < 2) return "";
  const days = [];
  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1].users, cur = snaps[i].users;
    let gain = 0;
    Object.keys(cur).forEach((u) => { if (u in prev) gain += Math.max(0, cur[u].totalXp - prev[u].totalXp); });
    days.push({ date: snaps[i].date, gain });
  }
  const recent = days.slice(-14);
  const max = Math.max(...recent.map((d) => d.gain));
  const title = `<h2 class="section-title">📊 XP per day — whole class</h2>`;
  if (max === 0) {
    return `${title}<div class="empty">No XP earned between snapshots yet — this chart fills in as the class practices.</div>`;
  }
  const W = 700, H = 190, padL = 46, padR = 8, padT = 20, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const step = plotW / recent.length;
  const bw = Math.max(6, Math.min(48, step - 4)); // >=4px gap between bars
  const yMax = niceCeil(max);
  const yOf = (v) => padT + plotH - (v / yMax) * plotH;
  const baseY = padT + plotH;
  const peakIdx = recent.findIndex((d) => d.gain === max);

  const grid = [yMax, yMax / 2]
    .map((v) => `
      <line x1="${padL}" y1="${yOf(v)}" x2="${W - padR}" y2="${yOf(v)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${padL - 6}" y="${yOf(v) + 3.5}" text-anchor="end" font-size="10" fill="var(--ink-soft)">${fmt(v)}</text>`)
    .join("");

  const labelEvery = Math.ceil(recent.length / 7);
  const bars = recent
    .map((d, i) => {
      const x = padL + i * step + (step - bw) / 2;
      const yTop = yOf(d.gain);
      const h = baseY - yTop;
      const r = Math.min(4, bw / 2, h);
      const shape = h <= 0.5
        ? `<line x1="${x}" y1="${baseY}" x2="${x + bw}" y2="${baseY}" stroke="var(--line)" stroke-width="2"/>`
        : `<path class="xp-bar" d="M${x},${baseY} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + bw - r},${yTop} Q${x + bw},${yTop} ${x + bw},${yTop + r} L${x + bw},${baseY} Z">
             <title>${escT(shortDay(d.date))} — ${fmt(d.gain)} XP</title>
           </path>`;
      const xLabel = i % labelEvery === 0
        ? `<text x="${x + bw / 2}" y="${baseY + 16}" text-anchor="middle" font-size="10" fill="var(--ink-soft)">${escT(shortDay(d.date))}</text>`
        : "";
      const peakLabel = i === peakIdx
        ? `<text x="${x + bw / 2}" y="${yTop - 5}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${fmt(d.gain)}</text>`
        : "";
      return shape + xLabel + peakLabel;
    })
    .join("");

  return `
    ${title}
    <div class="card" style="padding:14px 14px 8px;">
      <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;" role="img" aria-label="Class XP earned per day, last ${recent.length} days">
        ${grid}
        <line x1="${padL}" y1="${baseY}" x2="${W - padR}" y2="${baseY}" stroke="var(--ink-soft)" stroke-width="1"/>
        ${bars}
      </svg>
    </div>`;
}

/* -------------------- FAQ -------------------- */

function faqHtml() {
  return `
    <details class="card collapser" style="margin-top:14px;">
      <summary>❓ Help — my XP isn't showing</summary>
      <ul style="margin:12px 0 4px 22px;font-weight:700;line-height:1.9;">
        <li><strong>Profile set to private?</strong> In the Duolingo app: Profile → Settings → Privacy — the tracker can only see public profiles.</li>
        <li><strong>Username spelled exactly right?</strong> It's the @username on your Duolingo profile page, not your display name.</li>
        <li><strong>Just added or just practiced?</strong> XP updates once a night (just after midnight Pacific), so today's lessons show up tomorrow. Whoever runs the tracker can trigger an instant refresh: GitHub → Actions → Track Duolingo XP → Run workflow.</li>
        <li><strong>Weekly numbers look small?</strong> "This week" starts fresh every Monday and only counts XP earned since tracking began.</li>
      </ul>
    </details>`;
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
        <li>Run the <strong>Track Duolingo XP</strong> workflow once by hand (Run workflow ▸ main). After that it runs automatically every night just after midnight Pacific time.</li>
        <li>Refresh this page — weekly XP appears as soon as the first snapshot is committed.</li>
      </ol>
    </div>`;
}

/* -------------------- main render -------------------- */

function render(cfg, history) {
  const root = document.getElementById("tracker-root");
  const usernames = (cfg.usernames || []).filter(Boolean);
  // Usernames listed under "teachers" in data/usernames.json get a 🍎 badge and
  // sit outside the student competition (no podium spot, not in class totals).
  const teacherSet = new Set((cfg.teachers || []).map((t) => String(t).toLowerCase()));
  const snaps = (history.snapshots || [])
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((s) => s.users && Object.keys(s.users).length);

  const head = `<div class="page-head"><h1>📈 Class XP Tracker</h1>
    <span class="chip done" title="Every name links to the real profile; data is fetched nightly from duolingo.com">🟢 Connected to real Duolingo</span>` +
    (snaps.length
      ? `<span class="sub">Live public profile data from duolingo.com, snapshotted nightly · latest full day: <strong>${escT(snaps[snaps.length - 1].date)}</strong> · weeks run Monday–Sunday, Pacific time · tap a name to open the real profile</span>`
      : "") +
    `</div>`;

  if (!snaps.length) {
    const reason = usernames.length
      ? `${usernames.length} username${usernames.length === 1 ? " is" : "s are"} configured, but no snapshots have been recorded yet.`
      : "No Duolingo usernames are configured yet, so there is nothing to track.";
    root.innerHTML = head + localClassPanelHtml() + joinBoxHtml(true) + setupHelp(reason) + faqHtml();
    const emptySet = new Set(usernames.map((u) => u.toLowerCase()));
    bindLocalClass();
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

  // "This week" is the real current Mon-Sun week (Pacific), not just the newest
  // snapshot's week — so on Monday the leaderboard starts fresh instead of
  // re-showing the week that just closed.
  const thisWeek = weekStart(todayLocal());
  const lastWeek = addDays(thisWeek, -7);

  const prevSnap = snaps.length > 1 ? snaps[snaps.length - 2] : null;

  const rows = allUsers
    .map((u) => {
      const info = latest.users[u];
      const prevStreak = prevSnap && prevSnap.users[u] ? prevSnap.users[u].streak : null;
      return {
        username: u,
        name: info ? info.name : u,
        tracked: !!info,
        isTeacher: teacherSet.has(u.toLowerCase()),
        lostStreak: info && prevStreak !== null && info.streak < prevStreak && prevStreak >= 3 ? prevStreak : 0,
        totalXp: info ? info.totalXp : null,
        streak: info ? info.streak : null,
        thisWeek: weeklyGain(u, thisWeek),
        lastWeek: weeklyGain(u, lastWeek)
      };
    })
    .sort((a, b) => (b.thisWeek ?? -1) - (a.thisWeek ?? -1));

  const bestThisWeek = Math.max(0, ...rows.filter((r) => !r.isTeacher).map((r) => r.thisWeek ?? 0), 0);
  const classThisWeek = rows.reduce((a, r) => a + (r.isTeacher ? 0 : r.thisWeek || 0), 0);

  /* ----- podium leaderboard (This week / All time toggle) ----- */

  const ranked = rows.filter((r) => r.tracked && !r.isTeacher);
  const teacherRowsData = rows.filter((r) => r.tracked && r.isTeacher);

  const lbValue = (r, mode) =>
    mode === "week" ? (r.thisWeek === null ? "—" : `⚡ ${fmt(r.thisWeek)}`) : `⚡ ${fmt(r.totalXp ?? 0)}`;

  function lbInner(mode) {
    if (!ranked.length) return `<div class="empty">No tracked students yet — add some above!</div>`;
    const list = ranked.slice().sort((a, b) =>
      mode === "week"
        ? ((b.thisWeek ?? -1) - (a.thisWeek ?? -1)) || ((b.totalXp ?? 0) - (a.totalXp ?? 0))
        : ((b.totalXp ?? 0) - (a.totalXp ?? 0))
    );
    const top = [list[1], list[0], list[2]]; // visual order: 2nd, 1st, 3rd
    const cls = ["second", "first", "third"];
    const standNum = [2, 1, 3];
    const podium =
      `<div class="podium">` +
      top
        .map((r, i) =>
          r
            ? `<div class="slot ${cls[i]}">
                 <div class="avatar-circle">${escT((r.name || "?").trim().charAt(0).toUpperCase() || "?")}</div>
                 <div class="who">${isMine(r.username) ? "⭐ " : ""}${profileLink(r.username, escT(r.name))}</div>
                 <div class="score">${lbValue(r, mode)}</div>
                 <div class="stand">${standNum[i]}</div>
               </div>`
            : ""
        )
        .join("") +
      `</div>`;
    const rest = list
      .slice(3)
      .map(
        (r, i) => `
        <div class="lb-row">
          <span class="rank">${i + 4}</span>
          <span class="nm">${isMine(r.username) ? "⭐ " : ""}${profileLink(r.username, escT(r.name))} <span class="muted">@${escT(r.username)}</span></span>
          <span class="val">${lbValue(r, mode)}</span>
        </div>`
      )
      .join("");
    const teacherRows = teacherRowsData
      .map(
        (r) => `
        <div class="lb-row">
          <span class="rank">🍎</span>
          <span class="nm">${profileLink(r.username, escT(r.name))} <span class="muted">@${escT(r.username)}</span> <span class="chip done">Teacher</span></span>
          <span class="val">${lbValue(r, mode)}</span>
        </div>`
      )
      .join("");
    return `
      <div class="mode-switch lb-toggle">
        <button id="lb-week-btn" class="${mode === "week" ? "active" : ""}">This week</button>
        <button id="lb-all-btn" class="${mode === "all" ? "active" : ""}">All time</button>
      </div>
      ${podium}
      ${rest ? `<div class="lb-list">${rest}</div>` : ""}
      ${teacherRows ? `<div class="lb-list" style="margin-top:10px;">${teacherRows}</div>` : ""}`;
  }

  function mountLeaderboard(mode) {
    const box = document.getElementById("lb-section");
    if (!box) return;
    box.innerHTML = lbInner(mode);
    const wb = document.getElementById("lb-week-btn");
    const ab = document.getElementById("lb-all-btn");
    if (wb && wb.addEventListener) wb.addEventListener("click", () => mountLeaderboard("week"));
    if (ab && ab.addEventListener) ab.addEventListener("click", () => mountLeaderboard("all"));
  }

  const leaderboard = rows
    .map((r, i) => {
      if (!r.tracked)
        return `<tr><td>❓ <strong>${escT(r.username)}</strong></td><td colspan="4" class="muted">not found yet — check the username spelling and that the profile isn't private</td></tr>`;
      const medal = r.isTeacher ? "" : i === 0 && (r.thisWeek || 0) > 0 ? "🥇" : i === 1 && (r.thisWeek || 0) > 0 ? "🥈" : i === 2 && (r.thisWeek || 0) > 0 ? "🥉" : "";
      const mine = isMine(r.username) ? "⭐ " : "";
      return `
        <tr class="${!r.isTeacher && r.thisWeek === bestThisWeek && bestThisWeek > 0 ? "best" : ""}">
          <td>${medal} ${mine}<strong>${profileLink(r.username, escT(r.name))}</strong> <span class="muted">@${escT(r.username)}</span>${r.isTeacher ? ' <span class="chip done">🍎 Teacher</span>' : ""}</td>
          <td class="${(r.thisWeek || 0) > 0 ? "cell-good" : "cell-warn"}">${r.thisWeek === null ? "—" : "⚡ " + fmt(r.thisWeek)}</td>
          <td>${r.lastWeek === null ? "—" : "⚡ " + fmt(r.lastWeek)}</td>
          <td>${fmt(r.totalXp)}</td>
          <td>🔥 ${fmt(r.streak)}${r.lostStreak ? ` <span title="Lost a ${fmt(r.lostStreak)}-day streak — time to restart!">💔</span>` : ""}</td>
        </tr>`;
    })
    .join("");

  // Hall of fame: the student who earned the most XP in each completed week.
  const completedWeeks = weeks.filter((w) => w < thisWeek).slice(-6);
  const winnerCards = completedWeeks
    .map((w) => {
      let best = null, bestGain = 0;
      allUsers.forEach((u) => {
        if (teacherSet.has(u.toLowerCase())) return;
        const g = weeklyGain(u, w) || 0;
        if (g > bestGain) { bestGain = g; best = u; }
      });
      if (!best) return "";
      const nm = latest.users[best] ? latest.users[best].name : best;
      return `
        <div class="assignment-card" style="padding:10px 14px;">
          <span class="icon">🥇</span>
          <div class="meta">
            <strong>${profileLink(best, escT(nm))}</strong><br/>
            <span class="due">${escT(weekLabel(w))} · ⚡ ${fmt(bestGain)} XP</span>
          </div>
        </div>`;
    })
    .filter(Boolean)
    .reverse()
    .join("");
  const hallOfFame = winnerCards
    ? `<h2 class="section-title">🏛 Weekly winners</h2>
       <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));">${winnerCards}</div>`
    : "";

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
      return `<tr><td><strong>${profileLink(u, escT(info ? info.name : u))}</strong></td>${cells}</tr>`;
    })
    .join("");
  const historyTotals = historyWeeks
    .map((w) => `<td><strong>${fmt(allUsers.reduce((a, u) => a + (weeklyGain(u, w) || 0), 0))}</strong></td>`)
    .join("");

  // Spreadsheet-ready export of everyone's weekly XP for a teacher's gradebook.
  const csvHeader = ["Name", "Username", "Role", ...historyWeeks.map(weekLabel), "This week", "Last week", "Total XP", "Streak"];
  const csvRows = allUsers.map((u) => {
    const info = latest.users[u];
    return [
      info ? info.name : u,
      u,
      teacherSet.has(u.toLowerCase()) ? "teacher" : "student",
      ...historyWeeks.map((w) => { const g = weeklyGain(u, w); return g == null ? "" : g; }),
      weeklyGain(u, thisWeek) == null ? "" : weeklyGain(u, thisWeek),
      weeklyGain(u, lastWeek) == null ? "" : weeklyGain(u, lastWeek),
      info ? info.totalXp : "",
      info ? info.streak : ""
    ];
  });
  const csvText = toCsv([csvHeader, ...csvRows]);
  const csvName = `class-xp-${latest.date}.csv`;

  root.innerHTML = `
    ${head}
    <div class="stat-row">
      <div class="stat"><div class="num">⚡ ${fmt(classThisWeek)}</div><div class="lbl">Class XP this week</div></div>
      <div class="stat"><div class="num">${rows.filter((r) => r.tracked).length}/${allUsers.length}</div><div class="lbl">Profiles tracked</div></div>
      <div class="stat"><div class="num">${snaps.length}</div><div class="lbl">Daily snapshots</div></div>
      <div class="stat"><div class="num">${weeks.length}</div><div class="lbl">Weeks recorded</div></div>
    </div>

    <h2 class="section-title">🏆 Leaderboard</h2>
    <div id="lb-section"></div>

    ${dailyChartHtml(snaps)}

    ${hallOfFame}

    ${localClassPanelHtml()}

    ${joinBoxHtml()}

    <details class="card collapser" style="margin-top:4px;">
      <summary>📋 Full stats & weekly history</summary>
      <p style="margin:10px 0 4px;"><button class="btn ghost small" id="export-csv">⬇️ Download CSV (for your gradebook)</button></p>
      <h2 class="section-title">📋 Weekly details</h2>
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
      </table></div>
    </details>

    ${faqHtml()}`;

  mountLeaderboard("week");
  const exportBtn = document.getElementById("export-csv");
  if (exportBtn && exportBtn.addEventListener) exportBtn.addEventListener("click", () => downloadCsv(csvName, csvText));
  bindLocalClass();
  bindJoinBox(trackedLower);
  resumeWatchIfPending(trackedLower);
  renderLiveRows(trackedLower);
}

(async () => {
  // When printing, open the collapsed sections so the tables land on paper,
  // then restore them afterwards.
  if (typeof window !== "undefined" && window.addEventListener && document.querySelectorAll) {
    let reopened = [];
    window.addEventListener("beforeprint", () => {
      reopened = Array.from(document.querySelectorAll("details:not([open])"));
      reopened.forEach((d) => { d.open = true; });
    });
    window.addEventListener("afterprint", () => {
      reopened.forEach((d) => { d.open = false; });
      reopened = [];
    });
  }

  const shareBtn = document.getElementById("share-btn");
  if (shareBtn && shareBtn.addEventListener) {
    shareBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        shareBtn.textContent = "✅ Copied!";
      } catch (e) {
        try { if (navigator.share) navigator.share({ url: location.href }); } catch (e2) { /* fine */ }
      }
      setTimeout(() => { shareBtn.textContent = "🔗 Copy link"; }, 1500);
    });
  }

  const root = document.getElementById("tracker-root");
  try {
    const [cfg, history] = await Promise.all([loadJson("data/usernames.json"), loadJson("data/xp-history.json")]);
    render(cfg, history);
  } catch (err) {
    root.innerHTML = `<div class="page-head"><h1>📈 Class XP Tracker</h1></div>` +
      setupHelp(`Couldn't load tracker data (${err.message}). If you're opening this file directly from disk, serve it instead (python3 -m http.server) or use the GitHub Pages link.`);
  }
})();
