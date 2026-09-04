/*
 * Duolingo for Schools 2.0 — unofficial educational remake.
 * Vanilla JS single-page app: teacher dashboard + student lesson player.
 * State persists in localStorage. No build step, no dependencies.
 */
"use strict";

/* ============================== helpers ============================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const uid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);

// Light obfuscation for the teacher PIN — this is a classroom lock, not real
// security (everything lives in the browser; there is no server to enforce it).
const pinHash = (s) => {
  let h = 5381;
  for (const c of String(s)) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return h;
};

const isoDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const todayStr = () => isoDate(new Date());
const daysFromNow = (n) => isoDate(new Date(Date.now() + n * 86400000));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const sample = (arr, n) => shuffle(arr).slice(0, n);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const normalize = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const skillById = (id) => {
  for (const cr of COURSES) {
    const s = cr.skills.find((sk) => sk.id === id);
    if (s) return s;
  }
};
const courseById = (id) => COURSES.find((cr) => cr.id === id) || COURSES[0];
const courseOfClassroom = (c) => courseById(c && c.courseId);
const courseOfSkill = (skillId) => COURSES.find((cr) => cr.skills.some((sk) => sk.id === skillId)) || COURSES[0];

/* ---------- sound & speech (all best-effort; muted flag persists) ---------- */

const MUTE_KEY = "dfs2-muted";
const TTS_OK = (() => { try { return "speechSynthesis" in window; } catch (e) { return false; } })();
let muted = false;
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (e) { /* fine */ }
let audioCtx = null;

function beep(freq, delay, dur, type = "sine", vol = 0.12) {
  audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  o.connect(g);
  g.connect(audioCtx.destination);
  const t = audioCtx.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const playCorrect = () => { if (!muted) try { beep(660, 0, 0.12); beep(880, 0.13, 0.2); } catch (e) { /* no audio */ } };
const playWrong = () => { if (!muted) try { beep(220, 0, 0.18, "triangle", 0.1); beep(160, 0.18, 0.25, "triangle", 0.1); } catch (e) { /* no audio */ } };
const playBlip = () => { if (!muted) try { beep(784, 0, 0.09, "sine", 0.1); } catch (e) { /* no audio */ } };
const playFanfare = () => { if (!muted) try { beep(523, 0, 0.12); beep(659, 0.12, 0.12); beep(784, 0.24, 0.3); } catch (e) { /* no audio */ } };

function speak(text, lang) {
  if (muted) return;
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "es-ES";
    u.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* no speech support — fine */ }
}

// Pressing Enter in an input clicks its submit button.
function onEnter(inputSel, btnSel) {
  const input = $(inputSel);
  const btn = $(btnSel);
  if (input && btn) input.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
}

function classCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function relativeDay(dateStr) {
  if (!dateStr) return "never";
  const diff = Math.round((new Date(todayStr()) - new Date(dateStr)) / 86400000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff} days ago`;
}

function dueLabel(dateStr) {
  const diff = Math.round((new Date(dateStr) - new Date(todayStr())) / 86400000);
  if (diff < 0) return { text: `overdue by ${-diff} day${diff === -1 ? "" : "s"}`, late: true };
  if (diff === 0) return { text: "due today", late: false };
  if (diff === 1) return { text: "due tomorrow", late: false };
  return { text: `due in ${diff} days`, late: false };
}

/* ============================== state ============================== */

const STORAGE_KEY = "dfs2-state-v1";

// Fresh install: no role chosen yet — the start screen decides.
function emptyState() {
  return {
    mode: "teacher",
    role: null, // null (start screen) | "teacher" | "student"
    teacherPinHash: null,
    activeStudentId: null,
    classrooms: [],
    students: []
  };
}

function seedState() {
  const mk = (name, avatar, xp, streak, lastActiveDaysAgo, levels, done) => ({
    id: uid(),
    name,
    avatar,
    xp,
    streak,
    lastActive: lastActiveDaysAgo === null ? null : daysFromNow(-lastActiveDaysAgo),
    skillLevels: levels,
    completedAssignments: done
  });

  const a1 = { id: uid(), skillId: "greetings", due: daysFromNow(2), createdAt: todayStr() };
  const a2 = { id: uid(), skillId: "basics", due: daysFromNow(6), createdAt: todayStr() };

  const students = [
    mk("Ana", "🦊", 320, 6, 0, { basics: 3, greetings: 2, food: 1 }, [a1.id, a2.id]),
    mk("Ben", "🐼", 150, 2, 1, { basics: 2, greetings: 1 }, [a2.id]),
    mk("Carlos", "🐯", 85, 0, 3, { basics: 1 }, []),
    mk("Diya", "🐨", 240, 4, 0, { basics: 3, greetings: 1, food: 1 }, [a2.id]),
    mk("Emma", "🐸", 40, 1, 1, { basics: 1 }, []),
    mk("Farid", "🦁", 0, 0, null, {}, [])
  ];

  const classroom = {
    id: uid(),
    name: "Spanish 1 — Period 3",
    code: classCode(),
    courseId: COURSE.id,
    studentIds: students.map((s) => s.id),
    assignments: [a1, a2]
  };

  return {
    mode: "teacher",
    role: "teacher", // demo loads straight into the teacher dashboard, no PIN
    teacherPinHash: null,
    activeStudentId: null,
    classrooms: [classroom],
    students
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.classrooms) && Array.isArray(parsed.students)) {
        // Migrate pre-role saves: keep the data, let the start screen assign a role.
        if (parsed.role === undefined) parsed.role = null;
        if (parsed.teacherPinHash === undefined) parsed.teacherPinHash = null;
        return parsed;
      }
    }
  } catch (e) {
    /* corrupted or unavailable storage — fall through to a fresh start */
  }
  return emptyState();
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage may be unavailable (private mode) — app still works in-memory */
  }
}

const getStudent = (id) => state.students.find((s) => s.id === id);
const getClassroom = (id) => state.classrooms.find((c) => c.id === id);
const classroomsOf = (studentId) => state.classrooms.filter((c) => c.studentIds.includes(studentId));
const crownsOf = (student) => Object.values(student.skillLevels).reduce((a, b) => a + b, 0);

/* ============================== routing ============================== */

let route = { name: "teacher-home" };
let session = null; // active lesson session (not persisted)

function go(r) {
  route = r;
  render();
  window.scrollTo(0, 0);
}

function setMode(mode) {
  if (mode === "teacher" && state.role !== "teacher") return requestTeacherAccess();
  state.mode = mode;
  save();
  if (mode === "teacher") go({ name: "teacher-home" });
  else if (state.activeStudentId && getStudent(state.activeStudentId)) go({ name: "student-home" });
  else go({ name: "student-pick" });
}

// Teacher mode is PIN-locked once a PIN exists. Client-side only — it keeps
// students out of the dashboard on a shared device, nothing more.
function requestTeacherAccess() {
  if (state.teacherPinHash) {
    const pin = prompt("Enter the teacher PIN:");
    if (pin === null) return;
    if (pinHash(pin.trim()) !== state.teacherPinHash) return alert("Wrong PIN — ask your teacher.");
  } else if (!state.classrooms.length) {
    return go({ name: "onboarding" }); // nothing set up yet — run teacher setup
  } else if (!confirm("No teacher PIN is set on this device yet. Open the teacher dashboard?")) {
    return;
  }
  state.role = "teacher";
  state.mode = "teacher";
  save();
  go({ name: "teacher-home" });
}

function lockTeacherMode() {
  state.role = null;
  save();
  go({ name: "onboarding" });
}

// Shared login path for students: checks their personal PIN (if they set one)
// and remembers them for one-tap "Welcome back" next time. Teachers previewing
// the student view skip the PIN.
function loginStudent(id) {
  const s = getStudent(id);
  if (!s) return;
  if (state.role !== "teacher" && s.pinHash) {
    const p = prompt(`Hi ${s.name}! Enter your PIN:`);
    if (p === null) return;
    if (pinHash(p.trim()) !== s.pinHash) return alert("Wrong PIN — ask your teacher to reset it.");
  }
  state.activeStudentId = id;
  if (state.role !== "teacher") {
    state.role = "student";
    state.mode = "student";
    state.lastLogin = { type: "student", id };
  }
  save();
  go({ name: "student-home" });
}

/* ============================== shell ============================== */

function headerHtml() {
  const m = state.mode;
  const roleControls =
    state.role === "teacher"
      ? `<div class="mode-switch" role="tablist" aria-label="Mode">
           <button id="mode-teacher" class="${m === "teacher" ? "active" : ""}">🍎 Teacher</button>
           <button id="mode-student" class="${m === "student" ? "active" : ""}">🎒 Student view</button>
         </div>
         <button class="linkish" id="lock-btn" title="Lock the teacher dashboard on this device">🔒 Lock</button>`
      : `<button class="linkish" id="teacher-access-btn" title="Open the teacher dashboard (PIN needed)">Teacher?</button>`;
  return `
    <header class="topbar">
      <button class="brand" id="brand-btn">
        <span class="mascot">🦜</span>
        <span>Duolingo for Schools 2.0</span>
      </button>
      <div class="spacer"></div>
      ${roleControls}
      <a class="linkish" href="tracker.html" style="text-decoration:none;" title="Weekly XP from real Duolingo accounts">📈 XP tracker</a>
      <button class="linkish" id="reset-btn" title="Erase everything on this device and start over">Reset</button>
    </header>`;
}

function footerHtml() {
  return `<footer class="site">Fan-made project, not affiliated with Duolingo.</footer>`;
}

function shell(inner, { chrome = true } = {}) {
  $("#app").innerHTML = (chrome ? headerHtml() : "") + inner + (chrome ? footerHtml() : "");
  if (chrome) {
    const bind = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
    bind("#brand-btn", () => setMode(state.mode));
    bind("#mode-teacher", () => setMode("teacher"));
    bind("#mode-student", () => setMode("student"));
    bind("#lock-btn", lockTeacherMode);
    bind("#teacher-access-btn", requestTeacherAccess);
    bind("#reset-btn", () => {
      if (confirm("Reset the app? This erases every classroom, student, PIN, and progress record on this device.")) {
        state = emptyState();
        save();
        go({ name: "onboarding" });
      }
    });
  }
}

function render() {
  switch (route.name) {
    case "onboarding": return renderOnboarding();
    case "teacher-home": return renderTeacherHome();
    case "classroom": return renderClassroom();
    case "student-pick": return renderStudentPick();
    case "student-home": return renderStudentHome();
    case "lesson": return renderLesson();
    default: return renderTeacherHome();
  }
}

/* ============================== start screen ============================== */

function renderOnboarding() {
  const hasClasses = state.classrooms.length > 0;
  const hasPin = !!state.teacherPinHash;

  const lastStudent =
    state.lastLogin && state.lastLogin.type === "student" ? getStudent(state.lastLogin.id) : null;
  const welcomeBack = lastStudent
    ? `
      <div class="card" style="background:var(--green-pale);border-color:var(--green);display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:34px;">${lastStudent.avatar}</span>
        <div style="flex:1;min-width:160px;">
          <strong style="font-size:17px;">Welcome back, ${esc(lastStudent.name)}!</strong><br/>
          <span style="color:var(--ink-soft);font-weight:700;font-size:13px;">⚡ ${lastStudent.xp} XP · 🔥 ${lastStudent.streak} day streak</span>
        </div>
        <button class="btn small" id="ob-continue">Continue</button>
        <button class="linkish" id="ob-not-you">Not you?</button>
      </div>`
    : "";

  const teacherCard = !hasClasses
    ? `
      <div class="card">
        <h2 style="font-weight:900;margin-bottom:4px;">👩‍🏫 I'm a teacher</h2>
        <p style="color:var(--ink-soft);font-weight:700;font-size:14px;margin-bottom:10px;">
          Set up your classroom — you'll get a class code for your students,
          and an optional PIN keeps them out of your dashboard.
        </p>
        <div class="form-row">
          <input id="ob-class-name" placeholder="Classroom name (e.g. Spanish 1 — Period 3)" maxlength="40" style="flex:1;min-width:220px;" />
          <select id="ob-course">${COURSES.map((cr) => `<option value="${cr.id}">${cr.flag} ${esc(cr.title)}</option>`).join("")}</select>
        </div>
        <div class="form-row">
          <input id="ob-pin" placeholder="Teacher PIN (optional, 4+ digits)" maxlength="12" inputmode="numeric" />
          <button class="btn small" id="ob-teacher-btn">Create my classroom</button>
        </div>
        <p id="ob-teacher-error" style="color:var(--red);font-weight:700;font-size:13px;"></p>
      </div>`
    : `
      <div class="card">
        <h2 style="font-weight:900;margin-bottom:4px;">👩‍🏫 I'm the teacher</h2>
        <p style="color:var(--ink-soft);font-weight:700;font-size:14px;margin-bottom:10px;">
          ${hasPin ? "Enter your PIN to open the teacher dashboard." : "Open the teacher dashboard. Tip: set a PIN from the dashboard so students can't get in."}
        </p>
        <div class="form-row">
          ${hasPin ? `<input id="ob-unlock-pin" type="password" placeholder="Teacher PIN" maxlength="12" inputmode="numeric" />` : ""}
          <button class="btn small" id="ob-unlock-btn">Open teacher dashboard</button>
        </div>
        <p id="ob-teacher-error" style="color:var(--red);font-weight:700;font-size:13px;"></p>
      </div>`;

  const profiles = state.classrooms
    .flatMap((c) =>
      c.studentIds
        .map(getStudent)
        .filter(Boolean)
        .map(
          (s) => `
          <button class="picker-card" data-ob-pick="${s.id}">
            <span class="avatar">${s.avatar}</span>
            <span>${esc(s.name)}<span class="cls">${esc(c.name)}</span></span>
          </button>`
        )
    )
    .join("");

  const studentCard = `
    <div class="card">
      <h2 style="font-weight:900;margin-bottom:4px;">🎒 I'm a student</h2>
      ${profiles ? `<p style="color:var(--ink-soft);font-weight:700;font-size:14px;margin:6px 0;">Pick your profile:</p><div class="picker-list" style="margin-bottom:12px;">${profiles}</div><p style="color:var(--ink-soft);font-weight:700;font-size:14px;margin-bottom:6px;">…or join with a class code:</p>` : `<p style="color:var(--ink-soft);font-weight:700;font-size:14px;margin-bottom:10px;">Join with the class code your teacher gave you.</p>`}
      <div class="form-row">
        <input id="ob-code" placeholder="Class code" maxlength="6" style="text-transform:uppercase;width:130px;" />
        <input id="ob-name" placeholder="Your name" maxlength="30" />
      </div>
      <div class="form-row">
        <input id="ob-student-pin" placeholder="Secret PIN (optional)" maxlength="12" inputmode="numeric" style="width:180px;" />
        <button class="btn blue small" id="ob-join-btn">Join class</button>
      </div>
      <p style="color:var(--ink-soft);font-weight:700;font-size:12px;">A secret PIN stops classmates from opening your profile on a shared computer.</p>
      <p id="ob-join-error" style="color:var(--red);font-weight:700;font-size:13px;"></p>
    </div>`;

  shell(
    `
    <main class="page" style="max-width:760px;">
      <div style="text-align:center;margin:26px 0 26px;">
        <div style="font-size:64px;">🦜</div>
        <h1 style="font-size:30px;font-weight:900;color:var(--green);">Duolingo for Schools 2.0</h1>
        <p style="color:var(--ink-soft);font-weight:700;">Log in to start learning</p>
      </div>
      <div style="display:grid;gap:16px;">
        ${welcomeBack}
        ${teacherCard}
        ${studentCard}
        <div class="card" style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <span style="font-size:30px;">📈</span>
          <div style="flex:1;min-width:200px;">
            <strong>Class XP Tracker</strong><br/>
            <span style="color:var(--ink-soft);font-weight:700;font-size:13px;">Weekly XP from everyone's <em>real</em> Duolingo accounts — for your teacher.</span>
          </div>
          <a class="btn ghost small" href="tracker.html" style="text-decoration:none;">Open tracker</a>
        </div>
        ${!hasClasses ? `<p style="text-align:center;"><button class="linkish" id="ob-demo">Just exploring? Load the demo classroom →</button></p>` : ""}
      </div>
    </main>
    <footer class="site">Fan-made project, not affiliated with Duolingo.</footer>`,
    { chrome: false }
  );

  const bind = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };

  bind("#ob-teacher-btn", () => {
    const name = $("#ob-class-name").value.trim();
    const pin = $("#ob-pin").value.trim();
    const err = $("#ob-teacher-error");
    if (!name) { err.textContent = "Please give your classroom a name."; return; }
    if (pin && pin.length < 4) { err.textContent = "The PIN needs at least 4 characters (or leave it empty)."; return; }
    const courseSel = $("#ob-course");
    const courseId = courseSel && courseSel.value ? courseSel.value : COURSES[0].id;
    state.classrooms.push({ id: uid(), name, code: classCode(), courseId, studentIds: [], assignments: [] });
    state.teacherPinHash = pin ? pinHash(pin) : null;
    state.role = "teacher";
    state.mode = "teacher";
    save();
    go({ name: "classroom", classroomId: state.classrooms[state.classrooms.length - 1].id, tab: "overview" });
  });

  bind("#ob-unlock-btn", () => {
    const err = $("#ob-teacher-error");
    if (hasPin) {
      const pin = ($("#ob-unlock-pin").value || "").trim();
      if (pinHash(pin) !== state.teacherPinHash) { err.textContent = "Wrong PIN."; return; }
    }
    state.role = "teacher";
    state.mode = "teacher";
    save();
    go({ name: "teacher-home" });
  });

  bind("#ob-join-btn", () => {
    const code = $("#ob-code").value.trim().toUpperCase();
    const name = $("#ob-name").value.trim();
    const spin = ($("#ob-student-pin") ? $("#ob-student-pin").value : "").trim();
    const err = $("#ob-join-error");
    const c = state.classrooms.find((cl) => cl.code === code);
    if (!c) { err.textContent = "No class found with that code — ask your teacher for it."; return; }
    if (!name) { err.textContent = "Please enter your name."; return; }
    if (spin && spin.length < 4) { err.textContent = "Your secret PIN needs at least 4 characters (or leave it empty)."; return; }
    const s = {
      id: uid(), name, avatar: pick(STUDENT_AVATARS), xp: 0, streak: 0, lastActive: null,
      skillLevels: {}, completedAssignments: [], pinHash: spin ? pinHash(spin) : null
    };
    state.students.push(s);
    c.studentIds.push(s.id);
    state.activeStudentId = s.id;
    state.role = "student";
    state.mode = "student";
    state.lastLogin = { type: "student", id: s.id };
    save();
    go({ name: "student-home" });
  });

  bind("#ob-continue", () => lastStudent && loginStudent(lastStudent.id));
  bind("#ob-not-you", () => {
    state.lastLogin = null;
    save();
    go({ name: "onboarding" });
  });

  onEnter("#ob-class-name", "#ob-teacher-btn");
  onEnter("#ob-pin", "#ob-teacher-btn");
  onEnter("#ob-unlock-pin", "#ob-unlock-btn");
  onEnter("#ob-code", "#ob-join-btn");
  onEnter("#ob-name", "#ob-join-btn");
  onEnter("#ob-student-pin", "#ob-join-btn");

  bind("#ob-demo", () => {
    state = seedState();
    save();
    go({ name: "teacher-home" });
  });

  $$("[data-ob-pick]").forEach((el) =>
    el.addEventListener("click", () => loginStudent(el.dataset.obPick))
  );
}

/* ============================== teacher views ============================== */

function renderTeacherHome() {
  const cards = state.classrooms
    .map((c) => {
      const done = c.assignments.length
        ? c.assignments.reduce((acc, a) => acc + c.studentIds.filter((sid) => getStudent(sid)?.completedAssignments.includes(a.id)).length, 0)
        : 0;
      const totalSlots = c.assignments.length * c.studentIds.length;
      const crs = courseOfClassroom(c);
      return `
        <button class="card clickable" data-classroom="${c.id}">
          <h2 style="font-size:19px;font-weight:900;margin-bottom:6px;">🏫 ${esc(c.name)}</h2>
          <p style="color:var(--ink-soft);font-weight:700;font-size:14px;">
            ${crs.flag} ${crs.title} · ${c.studentIds.length} student${c.studentIds.length === 1 ? "" : "s"}<br/>
            ${c.assignments.length} assignment${c.assignments.length === 1 ? "" : "s"}${totalSlots ? ` · ${done}/${totalSlots} turned in` : ""}
          </p>
          <p style="margin-top:10px;font-weight:800;font-size:13px;color:var(--blue);">Class code: ${esc(c.code)}</p>
        </button>`;
    })
    .join("");

  shell(`
    <main class="page">
      <div class="page-head">
        <h1>My Classrooms</h1>
        <div class="spacer" style="flex:1"></div>
        <button class="btn ghost small" id="pin-btn">🔑 ${state.teacherPinHash ? "Change PIN" : "Set PIN"}</button>
        <button class="btn blue small" id="new-class-btn">+ New classroom</button>
      </div>
      ${!state.teacherPinHash ? `<p style="color:var(--ink-soft);font-weight:700;font-size:13px;margin:-8px 0 16px;">Tip: set a teacher PIN so students on this device can't open your dashboard.</p>` : ""}
      ${state.classrooms.length ? `<div class="grid">${cards}</div>` : `<div class="empty">No classrooms yet. Create one to get started!</div>`}
    </main>`);

  $("#pin-btn").addEventListener("click", () => {
    if (state.teacherPinHash) {
      const cur = prompt("Current PIN:");
      if (cur === null) return;
      if (pinHash(cur.trim()) !== state.teacherPinHash) return alert("Wrong PIN.");
    }
    const next = prompt("New teacher PIN (4+ characters — leave empty to remove the PIN):");
    if (next === null) return;
    const trimmed = next.trim();
    if (trimmed && trimmed.length < 4) return alert("The PIN needs at least 4 characters.");
    state.teacherPinHash = trimmed ? pinHash(trimmed) : null;
    save();
    alert(trimmed ? "PIN saved. Students now need it to open the teacher dashboard." : "PIN removed.");
    go({ name: "teacher-home" });
  });

  $("#new-class-btn").addEventListener("click", () => {
    const name = prompt("Classroom name (e.g. Spanish 2 — Period 5):");
    if (!name || !name.trim()) return;
    const c = { id: uid(), name: name.trim(), code: classCode(), courseId: COURSES[0].id, studentIds: [], assignments: [] };
    state.classrooms.push(c);
    save();
    go({ name: "classroom", classroomId: c.id, tab: "overview" });
  });

  $$("[data-classroom]").forEach((el) =>
    el.addEventListener("click", () => go({ name: "classroom", classroomId: el.dataset.classroom, tab: "overview" }))
  );
}

function renderClassroom() {
  const c = getClassroom(route.classroomId);
  if (!c) return go({ name: "teacher-home" });
  const tab = route.tab || "overview";
  const students = c.studentIds.map(getStudent).filter(Boolean);

  const tabs = ["overview", "students", "assignments", "leaderboard", "progress"]
    .map((t) => `<button data-tab="${t}" class="${t === tab ? "active" : ""}">${t}</button>`)
    .join("");

  let body = "";
  if (tab === "overview") body = overviewTab(c, students);
  if (tab === "students") body = studentsTab(c, students);
  if (tab === "assignments") body = assignmentsTab(c, students);
  if (tab === "leaderboard") body = leaderboardTab(c, students);
  if (tab === "progress") body = progressTab(c, students);

  shell(`
    <main class="page">
      <div class="page-head">
        <button class="linkish" id="back-btn">← Classrooms</button>
        <h1>🏫 ${esc(c.name)}</h1>
        <span class="sub">${courseOfClassroom(c).flag} ${courseOfClassroom(c).title} course · Class code <strong>${esc(c.code)}</strong></span>
      </div>
      <div class="tabs">${tabs}</div>
      ${body}
    </main>`);

  $("#back-btn").addEventListener("click", () => go({ name: "teacher-home" }));
  $$("[data-tab]").forEach((el) =>
    el.addEventListener("click", () => go({ name: "classroom", classroomId: c.id, tab: el.dataset.tab }))
  );
  const courseSel = $("#course-select");
  if (courseSel && courseSel.addEventListener)
    courseSel.addEventListener("change", () => {
      c.courseId = courseSel.value || c.courseId;
      save();
      go({ name: "classroom", classroomId: c.id, tab: "overview" });
    });

  const copyBtn = $("#copy-code-btn");
  if (copyBtn) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(c.code);
        copyBtn.textContent = "✅ Copied!";
      } catch (e) {
        copyBtn.textContent = c.code; // clipboard blocked — show the code on the button itself
      }
      setTimeout(() => { copyBtn.textContent = "📋 Copy code"; }, 1500);
    });
  }
  bindClassroomTab(c, students, tab);
}

function overviewTab(c, students) {
  const gettingStarted =
    !students.length || !c.assignments.length
      ? `
    <div class="card" style="margin-bottom:16px;background:var(--blue-pale);border-color:var(--blue);">
      <h3 style="font-weight:900;margin-bottom:8px;">🚀 Getting started</h3>
      <p style="font-weight:700;font-size:14px;margin:5px 0;">✅ Classroom created</p>
      <p style="font-weight:700;font-size:14px;margin:5px 0;">
        ${students.length ? "✅ Students joined" : `2️⃣ Tell students to open this site, tap <strong>I'm a student</strong>, and enter code <strong>${esc(c.code)}</strong>`}
        ${students.length ? "" : ` — or add them yourself in the <button class="linkish" data-tab="students">Students tab</button>`}
      </p>
      <p style="font-weight:700;font-size:14px;margin:5px 0;">
        ${c.assignments.length ? "✅ First assignment created" : `3️⃣ Give homework in the <button class="linkish" data-tab="assignments">Assignments tab</button>`}
      </p>
    </div>`
      : "";
  const totalXp = students.reduce((a, s) => a + s.xp, 0);
  const avgCrowns = students.length ? (students.reduce((a, s) => a + crownsOf(s), 0) / students.length).toFixed(1) : "0";
  const activeToday = students.filter((s) => s.lastActive === todayStr()).length;
  return `
    ${gettingStarted}
    <div class="stat-row">
      <div class="stat"><div class="num">${students.length}</div><div class="lbl">Students</div></div>
      <div class="stat"><div class="num">${totalXp}</div><div class="lbl">Total XP</div></div>
      <div class="stat"><div class="num">${c.assignments.length}</div><div class="lbl">Assignments</div></div>
      <div class="stat"><div class="num">${avgCrowns}</div><div class="lbl">Avg crowns</div></div>
      <div class="stat"><div class="num">${activeToday}</div><div class="lbl">Active today</div></div>
    </div>
    <div class="card">
      <h3 style="font-weight:900;margin-bottom:8px;">Invite students</h3>
      <p style="color:var(--ink-soft);font-weight:700;font-size:14px;margin-bottom:12px;">
        Students open the app, switch to <strong>Student</strong> mode, and join with this class code:
      </p>
      <span class="code-box">${esc(c.code)}</span>
      <button class="btn ghost small" id="copy-code-btn" style="margin-left:10px;">📋 Copy code</button>
      <div class="form-row" style="margin-top:16px;">
        <label for="course-select" style="font-weight:800;font-size:13px;color:var(--ink-soft);">Course:</label>
        <select id="course-select">${COURSES.map((cr) => `<option value="${cr.id}" ${cr.id === c.courseId ? "selected" : ""}>${cr.flag} ${esc(cr.title)}</option>`).join("")}</select>
      </div>
    </div>`;
}

function studentsTab(c, students) {
  const rows = students
    .map(
      (s) => `
      <tr>
        <td>${s.avatar} <strong>${esc(s.name)}</strong></td>
        <td>⚡ ${s.xp} XP</td>
        <td>🔥 ${s.streak}</td>
        <td>👑 ${crownsOf(s)}</td>
        <td class="${s.lastActive === todayStr() ? "cell-good" : "cell-warn"}">${relativeDay(s.lastActive)}</td>
        <td>${s.pinHash ? `<button class="linkish" data-resetpin="${s.id}">Reset PIN</button>` : ""} <button class="linkish" data-remove="${s.id}">Remove</button></td>
      </tr>`
    )
    .join("");

  return `
    <div class="form-row">
      <input id="new-student-name" placeholder="Student name" maxlength="30" />
      <button class="btn blue small" id="add-student-btn">+ Add student</button>
    </div>
    ${
      students.length
        ? `<div class="table-wrap"><table>
            <thead><tr><th>Student</th><th>XP</th><th>Streak</th><th>Crowns</th><th>Last active</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : `<div class="empty">No students yet — add one above or share the class code.</div>`
    }`;
}

function assignmentsTab(c, students) {
  const skillOptions = courseOfClassroom(c).skills.map((s) => `<option value="${s.id}">${s.icon} ${esc(s.title)}</option>`).join("");
  const list = c.assignments
    .map((a) => {
      const skill = skillById(a.skillId);
      const doneIds = c.studentIds.filter((sid) => getStudent(sid)?.completedAssignments.includes(a.id));
      const due = dueLabel(a.due);
      const chips = students
        .map((s) =>
          s.completedAssignments.includes(a.id)
            ? `<span class="chip done">${s.avatar} ${esc(s.name)} ✓</span>`
            : `<span class="chip pending">${s.avatar} ${esc(s.name)}</span>`
        )
        .join("");
      return `
        <div class="card" style="margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-size:26px;">${skill ? skill.icon : "📘"}</span>
            <div style="flex:1;">
              <strong style="font-size:16px;">Complete a lesson: ${skill ? esc(skill.title) : esc(a.skillId)}</strong><br/>
              <span style="font-size:13px;font-weight:700;color:${due.late ? "var(--red)" : "var(--ink-soft)"};">
                ${due.text} (${a.due}) · ${doneIds.length}/${c.studentIds.length} turned in
              </span>
            </div>
            <button class="linkish" data-del-assignment="${a.id}">Delete</button>
          </div>
          <div style="margin-top:10px;">${chips || '<span style="color:var(--ink-soft);font-weight:700;font-size:13px;">No students in this class yet.</span>'}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="card" style="margin-bottom:20px;">
      <h3 style="font-weight:900;margin-bottom:4px;">New assignment</h3>
      <div class="form-row">
        <select id="assign-skill">${skillOptions}</select>
        <input id="assign-due" type="date" value="${daysFromNow(7)}" min="${todayStr()}" />
        <button class="btn small" id="assign-btn">Assign</button>
      </div>
    </div>
    ${list || `<div class="empty">No assignments yet. Create one above!</div>`}`;
}

function leaderboardTab(c, students) {
  if (!students.length) return `<div class="empty">No students yet — the podium is waiting!</div>`;
  const list = students.slice().sort((a, b) => b.xp - a.xp);
  const top = [list[1], list[0], list[2]]; // visual order: 2nd, 1st, 3rd
  const cls = ["second", "first", "third"];
  const standNum = [2, 1, 3];
  const podium =
    `<div class="podium">` +
    top
      .map((s, i) =>
        s
          ? `<div class="slot ${cls[i]}">
               <div class="avatar-circle" style="font-size:32px;">${s.avatar}</div>
               <div class="who">${esc(s.name)}</div>
               <div class="score">⚡ ${s.xp} XP · 🔥 ${s.streak}</div>
               <div class="stand">${standNum[i]}</div>
             </div>`
          : ""
      )
      .join("") +
    `</div>`;
  const rest = list
    .slice(3)
    .map(
      (s, i) => `
      <div class="lb-row">
        <span class="rank">${i + 4}</span>
        <span class="nm">${s.avatar} ${esc(s.name)}</span>
        <span class="val">⚡ ${s.xp} XP</span>
        <span style="font-weight:800;">🔥 ${s.streak}</span>
      </div>`
    )
    .join("");
  return podium + (rest ? `<div class="lb-list">${rest}</div>` : "");
}

function progressTab(c, students) {
  if (!students.length) return `<div class="empty">Add students to see their progress here.</div>`;
  const course = courseOfClassroom(c);
  const head = course.skills.map((s) => `<th title="${esc(s.title)}">${s.icon}<br/>${esc(s.title)}</th>`).join("");
  const rows = students
    .map((s) => {
      const cells = course.skills
        .map((sk) => {
          const lvl = s.skillLevels[sk.id] || 0;
          return `<td class="${lvl ? "cell-good" : "cell-warn"}">${lvl ? "👑".repeat(Math.min(lvl, 3)) : "—"}</td>`;
        })
        .join("");
      return `<tr><td>${s.avatar} <strong>${esc(s.name)}</strong></td>${cells}</tr>`;
    })
    .join("");
  return `
    <p style="color:var(--ink-soft);font-weight:700;font-size:13px;margin-bottom:10px;">
      Each 👑 is one completed lesson level in a skill (max 3).
    </p>
    <div class="table-wrap"><table>
      <thead><tr><th>Student</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function bindClassroomTab(c, students, tab) {
  if (tab === "students") {
    onEnter("#new-student-name", "#add-student-btn");
    $("#add-student-btn").addEventListener("click", () => {
      const input = $("#new-student-name");
      const name = input.value.trim();
      if (!name) return input.focus();
      const s = {
        id: uid(),
        name,
        avatar: pick(STUDENT_AVATARS),
        xp: 0,
        streak: 0,
        lastActive: null,
        skillLevels: {},
        completedAssignments: []
      };
      state.students.push(s);
      c.studentIds.push(s.id);
      save();
      go({ name: "classroom", classroomId: c.id, tab: "students" });
    });
    $$("[data-resetpin]").forEach((el) =>
      el.addEventListener("click", () => {
        const s = getStudent(el.dataset.resetpin);
        if (!s || !confirm(`Remove ${s.name}'s secret PIN so they can log in again?`)) return;
        s.pinHash = null;
        save();
        go({ name: "classroom", classroomId: c.id, tab: "students" });
      })
    );
    $$("[data-remove]").forEach((el) =>
      el.addEventListener("click", () => {
        const s = getStudent(el.dataset.remove);
        if (!s || !confirm(`Remove ${s.name} from this classroom?`)) return;
        c.studentIds = c.studentIds.filter((id) => id !== s.id);
        if (!classroomsOf(s.id).length) {
          state.students = state.students.filter((st) => st.id !== s.id);
          if (state.activeStudentId === s.id) state.activeStudentId = null;
        }
        save();
        go({ name: "classroom", classroomId: c.id, tab: "students" });
      })
    );
  }
  if (tab === "assignments") {
    $("#assign-btn").addEventListener("click", () => {
      const skillId = $("#assign-skill").value;
      const due = $("#assign-due").value || daysFromNow(7);
      c.assignments.push({ id: uid(), skillId, due, createdAt: todayStr() });
      save();
      go({ name: "classroom", classroomId: c.id, tab: "assignments" });
    });
    $$("[data-del-assignment]").forEach((el) =>
      el.addEventListener("click", () => {
        if (!confirm("Delete this assignment?")) return;
        c.assignments = c.assignments.filter((a) => a.id !== el.dataset.delAssignment);
        save();
        go({ name: "classroom", classroomId: c.id, tab: "assignments" });
      })
    );
  }
}

/* ============================== student views ============================== */

function renderStudentPick() {
  const cards = state.classrooms
    .flatMap((c) =>
      c.studentIds
        .map(getStudent)
        .filter(Boolean)
        .map(
          (s) => `
          <button class="picker-card" data-pick="${s.id}">
            <span class="avatar">${s.avatar}</span>
            <span>${esc(s.name)}<span class="cls">${esc(c.name)}</span></span>
          </button>`
        )
    )
    .join("");

  shell(`
    <main class="page">
      <div class="page-head"><h1>Who's learning today?</h1><div class="spacer" style="flex:1"></div><button class="linkish" id="back-start">← Start screen</button></div>
      ${cards ? `<div class="picker-list">${cards}</div>` : `<div class="empty">No students yet — join a class below.</div>`}
      <h2 class="section-title">Join a class</h2>
      <div class="card">
        <div class="form-row">
          <input id="join-code" placeholder="Class code (e.g. ABC123)" maxlength="6" style="text-transform:uppercase;" />
          <input id="join-name" placeholder="Your name" maxlength="30" />
          <button class="btn small" id="join-btn">Join class</button>
        </div>
        <p id="join-error" style="color:var(--red);font-weight:700;font-size:13px;"></p>
      </div>
    </main>`);

  const backBtn = $("#back-start");
  if (backBtn) backBtn.addEventListener("click", () => go({ name: "onboarding" }));

  $$("[data-pick]").forEach((el) =>
    el.addEventListener("click", () => loginStudent(el.dataset.pick))
  );

  onEnter("#join-code", "#join-btn");
  onEnter("#join-name", "#join-btn");
  $("#join-btn").addEventListener("click", () => {
    const code = $("#join-code").value.trim().toUpperCase();
    const name = $("#join-name").value.trim();
    const err = $("#join-error");
    const c = state.classrooms.find((cl) => cl.code === code);
    if (!c) { err.textContent = "No class found with that code."; return; }
    if (!name) { err.textContent = "Please enter your name."; return; }
    const s = {
      id: uid(),
      name,
      avatar: pick(STUDENT_AVATARS),
      xp: 0,
      streak: 0,
      lastActive: null,
      skillLevels: {},
      completedAssignments: []
    };
    state.students.push(s);
    c.studentIds.push(s.id);
    state.activeStudentId = s.id;
    if (state.role !== "teacher") state.role = "student";
    save();
    go({ name: "student-home" });
  });
}

function renderStudentHome() {
  const s = getStudent(state.activeStudentId);
  if (!s) return go({ name: "student-pick" });
  const myClasses = classroomsOf(s.id);
  const DAILY_GOAL = 30;
  const todayXp = s.today && s.today.date === todayStr() ? s.today.xp : 0;
  const goalPct = Math.min(1, todayXp / DAILY_GOAL);

  const pendingAssignments = myClasses.flatMap((c) =>
    c.assignments
      .filter((a) => !s.completedAssignments.includes(a.id))
      .map((a) => ({ ...a, className: c.name }))
  );

  const assignmentCards = pendingAssignments
    .map((a) => {
      const skill = skillById(a.skillId);
      const due = dueLabel(a.due);
      return `
        <div class="assignment-card ${due.late ? "overdue" : ""}">
          <span class="icon">${skill ? skill.icon : "📘"}</span>
          <div class="meta">
            <strong>Complete a lesson: ${skill ? esc(skill.title) : esc(a.skillId)}</strong><br/>
            <span class="due ${due.late ? "late" : ""}">${due.text} · ${esc(a.className)}</span>
          </div>
          <button class="btn small" data-start-assignment="${a.id}" data-skill="${a.skillId}">Start</button>
        </div>`;
    })
    .join("");

  const classmates = myClasses[0]
    ? myClasses[0].studentIds.map(getStudent).filter(Boolean).sort((a, b) => b.xp - a.xp).slice(0, 5)
    : [];
  const classLeaderboard =
    classmates.length > 1
      ? `
      <h2 class="section-title">🏆 Class leaderboard</h2>
      <div class="lb-list">${classmates
        .map(
          (cs, i) => `
          <div class="lb-row">
            <span class="rank">${["🥇", "🥈", "🥉"][i] || i + 1}</span>
            <span class="nm">${cs.avatar} ${esc(cs.name)}${cs.id === s.id ? " ⭐" : ""}</span>
            <span class="val">⚡ ${cs.xp} XP</span>
          </div>`
        )
        .join("")}</div>`
      : "";

  const course = courseOfClassroom(myClasses[0]);
  const tree = course.skills
    .map((sk) => {
      const lvl = s.skillLevels[sk.id] || 0;
      const cls = lvl >= 3 ? "maxed" : lvl > 0 ? "started" : "";
      return `
        <button class="skill-node ${cls}" data-start-skill="${sk.id}">
          <span class="bubble">${sk.icon}</span>
          <span class="name">${esc(sk.title)}</span>
          <span class="crowns">${lvl ? "👑".repeat(Math.min(lvl, 3)) : "Start"}</span>
        </button>`;
    })
    .join("");

  shell(`
    <main class="page">
      <div class="hud">
        <span style="font-size:38px;">${s.avatar}</span>
        <div>
          <div style="font-weight:900;font-size:20px;">${esc(s.name)}</div>
          <div style="color:var(--ink-soft);font-weight:700;font-size:13px;">${myClasses.map((c) => esc(c.name)).join(" · ") || "No class yet"}</div>
        </div>
        <div class="spacer" style="flex:1"></div>
        <span class="pill" title="Daily goal: earn ${DAILY_GOAL} XP today">
          <svg width="44" height="44" viewBox="0 0 48 48" style="display:block;" role="img" aria-label="Daily goal: ${todayXp} of ${DAILY_GOAL} XP">
            <circle cx="24" cy="24" r="20" fill="none" stroke="var(--line)" stroke-width="5"/>
            <circle cx="24" cy="24" r="20" fill="none" stroke="${goalPct >= 1 ? "var(--yellow)" : "var(--green)"}" stroke-width="5"
              stroke-linecap="round" stroke-dasharray="${(goalPct * 125.7).toFixed(1)} 125.7" transform="rotate(-90 24 24)"/>
            <text x="24" y="30" text-anchor="middle" font-size="15">${goalPct >= 1 ? "🎉" : "🎯"}</text>
          </svg>
          ${todayXp}/${DAILY_GOAL} today
        </span>
        <span class="pill" title="Total XP">⚡ ${s.xp} XP</span>
        <span class="pill" title="Day streak">🔥 ${s.streak}</span>
        <span class="pill" title="Crowns">👑 ${crownsOf(s)}</span>
        <button class="linkish" id="student-pin-btn" title="Set or change your secret PIN">🔑 PIN</button>
        <button class="linkish" id="logout-btn">Log out</button>
      </div>

      <h2 class="section-title">📌 Assignments from your teacher</h2>
      ${assignmentCards || `<div class="empty">🎉 Nothing due — you're all caught up!</div>`}
      ${classLeaderboard}

      <h2 class="section-title">${course.flag} ${course.title} — Skill tree</h2>
      <div class="skill-tree">${tree}</div>
    </main>`);

  const logoutBtn = $("#logout-btn");
  if (logoutBtn)
    logoutBtn.addEventListener("click", () => {
      if (state.role !== "teacher") state.role = null; // teacher previews return to their dashboard via the toggle
      save();
      go(state.role === "teacher" ? { name: "student-pick" } : { name: "onboarding" });
    });

  const pinBtn = $("#student-pin-btn");
  if (pinBtn)
    pinBtn.addEventListener("click", () => {
      if (s.pinHash) {
        const cur = prompt("Current PIN:");
        if (cur === null) return;
        if (pinHash(cur.trim()) !== s.pinHash) return alert("Wrong PIN — ask your teacher to reset it.");
      }
      const next = prompt("New secret PIN (4+ characters — leave empty to remove it):");
      if (next === null) return;
      const t = next.trim();
      if (t && t.length < 4) return alert("The PIN needs at least 4 characters.");
      s.pinHash = t ? pinHash(t) : null;
      save();
      alert(t ? "PIN saved! You'll need it next time you log in." : "PIN removed.");
    });
  $$("[data-start-assignment]").forEach((el) =>
    el.addEventListener("click", () => startLesson(el.dataset.skill, el.dataset.startAssignment))
  );
  $$("[data-start-skill]").forEach((el) =>
    el.addEventListener("click", () => startLesson(el.dataset.startSkill, null))
  );
}

/* ============================== lesson engine ============================== */

function generateLesson(skill, count = 8) {
  const course = courseOfSkill(skill.id);
  const exercises = [];
  const words = shuffle(skill.words);
  const sentences = shuffle(skill.sentences);
  const allWords = course.skills.flatMap((s) => s.words);

  // 1 match + up to 2 word-bank sentences (+ 1 listening when the browser can
  // speak) + choice/type for the rest
  exercises.push(makeMatch(skill));
  sentences.slice(0, 2).forEach((sen) => exercises.push(makeBank(sen, allWords, course)));
  if (TTS_OK) exercises.push(makeListen(words[0], skill, course));

  let wi = TTS_OK ? 1 : 0;
  const kinds = ["choice", "reverse-choice", "type"];
  while (exercises.length < count) {
    const w = words[wi % words.length];
    wi++;
    const kind = kinds[exercises.length % kinds.length];
    if (kind === "choice") exercises.push(makeChoice(w, skill, "target-en", course));
    else if (kind === "reverse-choice") exercises.push(makeChoice(w, skill, "en-target", course));
    else exercises.push(makeType(w, course));
  }
  return shuffle(exercises);
}

function makeChoice(word, skill, dir, course) {
  const toEnglish = dir === "target-en";
  const answer = toEnglish ? word.en : word.es;
  const distractors = sample(
    skill.words.filter((w) => w !== word).map((w) => (toEnglish ? w.en : w.es)),
    3
  );
  return {
    kind: "choice",
    label: toEnglish ? `Select the meaning of the ${course.langName} word` : `Select the ${course.langName} translation`,
    prompt: toEnglish ? word.es : word.en,
    options: shuffle([answer, ...distractors]),
    answer,
    speak: toEnglish ? word.es : word.en,
    speakLang: toEnglish ? course.lang : "en-US"
  };
}

function makeType(word, course) {
  return {
    kind: "type",
    label: "Type the English translation",
    prompt: word.es,
    answer: word.en,
    speak: word.es,
    speakLang: course.lang
  };
}

function makeListen(word, skill, course) {
  const distractors = sample(
    skill.words.filter((w) => w !== word).map((w) => w.es),
    3
  );
  return {
    kind: "listen",
    label: "Tap what you hear",
    options: shuffle([word.es, ...distractors]),
    answer: word.es,
    speak: word.es,
    speakLang: course.lang
  };
}

function makeBank(sentence, allWords, course) {
  const tokens = sentence.en.replace(/[.,!?—]/g, "").split(/\s+/).filter(Boolean);
  const distractorPool = allWords
    .flatMap((w) => w.en.replace(/[.,!?—]/g, "").split(/\s+/))
    .filter((t) => !tokens.some((tok) => normalize(tok) === normalize(t)));
  const bank = shuffle(tokens.concat(sample(Array.from(new Set(distractorPool)), 3)));
  return {
    kind: "bank",
    label: "Translate this sentence",
    prompt: sentence.es,
    bank,
    answer: tokens.join(" "),
    speak: sentence.es,
    speakLang: course.lang
  };
}

function makeMatch(skill) {
  const pairs = sample(skill.words, 4);
  return {
    kind: "match",
    label: "Tap the matching pairs",
    pairs,
    left: shuffle(pairs.map((p) => p.es)),
    right: shuffle(pairs.map((p) => p.en))
  };
}

function startLesson(skillId, assignmentId) {
  const skill = skillById(skillId);
  if (!skill) return;
  const queue = generateLesson(skill);
  session = {
    skillId,
    assignmentId,
    queue,
    total: queue.length,
    correct: 0,
    mistakes: 0,
    hearts: 3,
    finished: false,
    failed: false,
    rewarded: false
  };
  go({ name: "lesson" });
}

function renderLesson() {
  if (!session) return go({ name: "student-home" });
  if (session.failed) return renderLessonFailed();
  if (!session.queue.length) return renderLessonComplete();

  const ex = session.queue[0];
  const pct = Math.round((session.correct / session.total) * 100);

  let body = "";
  if (ex.kind === "choice" || ex.kind === "listen") {
    body = `<div class="options">${ex.options
      .map((o, i) => `<button class="option" data-opt="${i}">${esc(o)}</button>`)
      .join("")}</div>`;
  } else if (ex.kind === "type") {
    body = `<input class="type-input" id="type-answer" autocomplete="off" placeholder="Type in English…" />`;
  } else if (ex.kind === "bank") {
    body = `
      <div class="bank-answer" id="bank-answer"></div>
      <div class="bank-pool">${ex.bank.map((t, i) => `<button class="token" data-tok="${i}">${esc(t)}</button>`).join("")}</div>`;
  } else if (ex.kind === "match") {
    body = `
      <div class="match-grid">
        ${ex.left.map((t, i) => `<button class="match-btn" data-side="l" data-val="${esc(t)}" data-i="${i}">${esc(t)}</button>`).join("")}
        ${ex.right.map((t, i) => `<button class="match-btn" data-side="r" data-val="${esc(t)}" data-i="${i}">${esc(t)}</button>`).join("")}
      </div>`;
  }

  shell(
    `
    <div class="lesson-top">
      <button class="quit" id="quit-btn" title="Quit lesson">✕</button>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <button class="quit" id="mute-btn" title="Turn sounds on or off">${muted ? "🔇" : "🔊"}</button>
      <span class="hearts">${"❤️".repeat(session.hearts)}${"🖤".repeat(3 - session.hearts)}</span>
    </div>
    <main class="lesson-body">
      <div class="exercise-kind">${esc(ex.label)}</div>
      ${ex.kind === "match" ? "" : ex.kind === "listen"
        ? `<div class="prompt"><button class="speak-btn big" id="speak-btn" title="Listen">🔊</button><span style="font-size:16px;color:var(--ink-soft);font-weight:700;">Tap the speaker, then choose what you heard</span></div>`
        : `<div class="prompt">${ex.speak ? `<button class="speak-btn" id="speak-btn" title="Listen">🔊</button>` : ""}${esc(ex.prompt)}</div>`}
      ${body}
    </main>
    <div class="lesson-footer" id="lesson-footer">
      <div class="inner">
        <div class="msg" id="footer-msg"><span style="color:var(--ink-soft);font-weight:700;font-size:12px;">⌨️ Tip: press 1–4 to answer, Enter to check &amp; continue</span></div>
        <button class="btn" id="check-btn" ${ex.kind === "match" ? "style='visibility:hidden'" : "disabled"}>Check</button>
      </div>
    </div>`,
    { chrome: false }
  );

  $("#quit-btn").addEventListener("click", () => {
    if (confirm("Quit this lesson? Progress in it will be lost.")) {
      session = null;
      go({ name: "student-home" });
    }
  });

  const muteBtn = $("#mute-btn");
  if (muteBtn)
    muteBtn.addEventListener("click", () => {
      muted = !muted;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (e) { /* fine */ }
      try { if (muted && window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* fine */ }
      muteBtn.textContent = muted ? "🔇" : "🔊";
    });

  const speakBtn = $("#speak-btn");
  if (speakBtn) speakBtn.addEventListener("click", () => speak(ex.speak, ex.speakLang));

  bindExercise(ex);
}

function bindExercise(ex) {
  const checkBtn = $("#check-btn");

  if (ex.kind === "choice" || ex.kind === "listen") {
    let selected = null;
    $$("[data-opt]").forEach((el) =>
      el.addEventListener("click", () => {
        $$("[data-opt]").forEach((o) => o.classList.remove("selected"));
        el.classList.add("selected");
        selected = ex.options[Number(el.dataset.opt)];
        checkBtn.disabled = false;
      })
    );
    checkBtn.addEventListener("click", () => {
      const ok = selected === ex.answer;
      $$("[data-opt]").forEach((o) => {
        o.disabled = true;
        const val = ex.options[Number(o.dataset.opt)];
        if (val === ex.answer) o.classList.add("correct");
        else if (o.classList.contains("selected") && !ok) o.classList.add("wrong");
      });
      gradeAnswer(ok, ex.answer);
    });
  }

  if (ex.kind === "type") {
    const input = $("#type-answer");
    input.focus();
    input.addEventListener("input", () => (checkBtn.disabled = !input.value.trim()));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !checkBtn.disabled && !checkBtn.dataset.done) checkBtn.click();
    });
    checkBtn.addEventListener("click", () => {
      checkBtn.dataset.done = "1";
      input.disabled = true;
      gradeAnswer(normalize(input.value) === normalize(ex.answer), ex.answer);
    });
  }

  if (ex.kind === "bank") {
    const chosen = []; // indices into ex.bank, in order
    const answerBox = $("#bank-answer");
    const redraw = () => {
      answerBox.innerHTML = chosen
        .map((i, pos) => `<button class="token" data-chosen="${pos}">${esc(ex.bank[i])}</button>`)
        .join("");
      $$("[data-tok]").forEach((el) => el.classList.toggle("used", chosen.includes(Number(el.dataset.tok))));
      $$("[data-chosen]").forEach((el) =>
        el.addEventListener("click", () => {
          chosen.splice(Number(el.dataset.chosen), 1);
          redraw();
        })
      );
      checkBtn.disabled = chosen.length === 0;
    };
    $$("[data-tok]").forEach((el) =>
      el.addEventListener("click", () => {
        const i = Number(el.dataset.tok);
        if (!chosen.includes(i)) {
          chosen.push(i);
          redraw();
        }
      })
    );
    checkBtn.addEventListener("click", () => {
      const built = chosen.map((i) => ex.bank[i]).join(" ");
      $$("#bank-answer .token, .bank-pool .token").forEach((el) => (el.disabled = true));
      gradeAnswer(normalize(built) === normalize(ex.answer), ex.answer);
    });
  }

  if (ex.kind === "match") {
    let selectedLeft = null;
    let matched = 0;
    const pairOf = (es) => ex.pairs.find((p) => p.es === es);
    $$(".match-btn").forEach((el) =>
      el.addEventListener("click", () => {
        const side = el.dataset.side;
        if (side === "l") {
          $$('.match-btn[data-side="l"]').forEach((b) => b.classList.remove("selected"));
          el.classList.add("selected");
          selectedLeft = el;
        } else if (selectedLeft) {
          const pair = pairOf(selectedLeft.dataset.val);
          if (pair && pair.en === el.dataset.val) {
            selectedLeft.classList.remove("selected");
            selectedLeft.classList.add("matched");
            el.classList.add("matched");
            selectedLeft = null;
            matched++;
            if (matched === ex.pairs.length) gradeAnswer(true, null);
            else playBlip();
          } else {
            el.classList.add("shake");
            setTimeout(() => el.classList.remove("shake"), 350);
            session.mistakes++;
            playWrong();
          }
        }
      })
    );
  }
}

function gradeAnswer(ok, correctAnswer) {
  const footer = $("#lesson-footer");
  const msg = $("#footer-msg");
  const checkBtn = $("#check-btn");

  if (ok) {
    playCorrect();
    session.correct++;
    session.queue.shift();
    footer.classList.add("good");
    msg.innerHTML = `<div class="headline">${pick(["Nicely done!", "Excellent!", "Correct!", "Great job!"])}</div>`;
  } else {
    playWrong();
    session.mistakes++;
    session.hearts--;
    footer.classList.add("bad");
    msg.innerHTML = `<div class="headline">Incorrect</div><div class="detail">Correct answer: ${esc(correctAnswer)}</div>`;
    // Requeue the missed exercise so it must be answered correctly to finish.
    const missed = session.queue.shift();
    if (session.hearts > 0) session.queue.push(missed);
    else session.failed = true;
  }

  checkBtn.style.visibility = "visible";
  checkBtn.disabled = false;
  checkBtn.textContent = "Continue";
  const fresh = checkBtn.cloneNode(true); // drop old listeners
  checkBtn.replaceWith(fresh);
  fresh.addEventListener("click", () => renderLesson());
  fresh.focus();
}

function applyRewards() {
  if (session.rewarded) return;
  session.rewarded = true;

  const s = getStudent(state.activeStudentId);
  if (!s) return;

  session.xpEarned = 10 + (session.mistakes === 0 ? 5 : 0);
  s.xp += session.xpEarned;
  s.skillLevels[session.skillId] = Math.min(3, (s.skillLevels[session.skillId] || 0) + 1);

  const today = todayStr();
  if (s.lastActive !== today) {
    const yesterday = daysFromNow(-1);
    s.streak = s.lastActive === yesterday ? s.streak + 1 : 1;
    s.lastActive = today;
  }

  // Track XP earned today for the daily-goal ring.
  if (s.today && s.today.date === today) s.today.xp += session.xpEarned;
  else s.today = { date: today, xp: session.xpEarned };

  // Any assignment in this student's classrooms for this skill counts as turned in.
  classroomsOf(s.id).forEach((c) =>
    c.assignments.forEach((a) => {
      if (a.skillId === session.skillId && !s.completedAssignments.includes(a.id)) {
        s.completedAssignments.push(a.id);
      }
    })
  );
  save();
}

function renderLessonComplete() {
  applyRewards();
  playFanfare();
  const skill = skillById(session.skillId);
  const perfect = session.mistakes === 0;
  const confetti = Array.from(
    { length: 18 },
    () =>
      `<span style="left:${Math.floor(Math.random() * 100)}%;animation-delay:${(Math.random() * 0.9).toFixed(2)}s;font-size:${18 + Math.floor(Math.random() * 18)}px;">${pick(["🎉", "✨", "⭐", "🎊"])}</span>`
  ).join("");
  shell(
    `
    <div class="confetti" aria-hidden="true">${confetti}</div>
    <div class="finish">
      <div class="big">${perfect ? "🏆" : "🎉"}</div>
      <h1>Lesson complete!</h1>
      <p>${skill ? esc(skill.title) : ""} · ${perfect ? "Perfect lesson — no mistakes!" : "Nice work, keep practicing!"}</p>
      <div class="stat-row">
        <div class="stat"><div class="num">⚡ ${session.xpEarned || 0}</div><div class="lbl">XP earned</div></div>
        <div class="stat"><div class="num">🎯 ${Math.round((session.total / (session.total + session.mistakes)) * 100)}%</div><div class="lbl">Accuracy</div></div>
      </div>
      <button class="btn" id="continue-btn">Continue</button>
    </div>`,
    { chrome: false }
  );
  $("#continue-btn").addEventListener("click", () => {
    session = null;
    go({ name: "student-home" });
  });
}

function renderLessonFailed() {
  shell(
    `
    <div class="finish">
      <div class="big">💔</div>
      <h1>You ran out of hearts!</h1>
      <p>Don't worry — mistakes are how we learn. Try the lesson again.</p>
      <button class="btn red" id="retry-btn">Try again</button>
      &nbsp;
      <button class="btn ghost" id="home-btn">Back home</button>
    </div>`,
    { chrome: false }
  );
  $("#retry-btn").addEventListener("click", () => startLesson(session.skillId, session.assignmentId));
  $("#home-btn").addEventListener("click", () => {
    session = null;
    go({ name: "student-home" });
  });
}

/* ============================== keyboard shortcuts ============================== */

// In lessons: number keys pick an answer, Enter checks / continues.
// Registered once at boot, so re-renders never stack duplicate listeners.
if (typeof document.addEventListener === "function") {
  document.addEventListener("keydown", (e) => {
    if (route.name !== "lesson") return;
    if (e.key === "Enter") {
      if (e.target && e.target.tagName === "INPUT") return; // the type exercise handles its own Enter
      const btn = $("#check-btn");
      if (btn && !btn.disabled && btn.style.visibility !== "hidden") btn.click();
      return;
    }
    const n = Number(e.key);
    if (n >= 1 && n <= 4) {
      const opts = $$(".option");
      if (opts[n - 1] && !opts[n - 1].disabled) opts[n - 1].click();
    }
  });
}

/* ============================== boot ============================== */

if (!state.role) go({ name: "onboarding" });
else if (state.role === "student") setMode("student");
else setMode(state.mode || "teacher");
