/*
 * Shared Duolingo access for the tracker's Node scripts.
 *
 * Two kinds of reads:
 *  - publicProfile(): Duolingo's keyless public-profile endpoint. Anyone can call
 *    it, but its "totalXp" counts LANGUAGE courses only — XP earned in Duolingo
 *    Math and Music is left out, so it can be far below the Total XP the app shows.
 *  - The token reads (accountTotals, dailyXp): the same calls Duolingo's own apps
 *    make, authorized with a Duolingo login token (the "jwt_token" cookie of a
 *    logged-in duolingo.com session). Duolingo issues no developer API keys, so
 *    this token is the closest thing to one. It is read from the DUOLINGO_JWT
 *    environment variable (a GitHub Actions secret) and never written anywhere.
 */

export const API = "https://www.duolingo.com/2017-06-30";
export const TIMEZONE = "America/Los_Angeles";
const UA = "Mozilla/5.0 (classroom XP tracker; educational project)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Calendar date (YYYY-MM-DD) in the tracker's timezone, shifted by msOffset.
export const localDate = (msOffset = 0) =>
  new Date(Date.now() + msOffset).toLocaleDateString("en-CA", { timeZone: TIMEZONE });

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function decodeJwt(token) {
  try {
    const part = String(token).split(".")[1];
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function getJson(url, jwt) {
  const headers = { "User-Agent": UA, Accept: "application/json" };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// Keyless public profile. totalXp here = language-course XP only (see header).
export async function publicProfile(username) {
  const fields = "users{id,username,name,totalXp,streak,courses{title,xp}}";
  const json = await getJson(`${API}/users?username=${encodeURIComponent(username)}&fields=${encodeURIComponent(fields)}`);
  const u = json.users && json.users[0];
  if (!u) {
    const e = new Error("profile not found (check spelling / profile must be public)");
    e.notFound = true;
    throw e;
  }
  return {
    id: u.id,
    username: u.username || username,
    name: u.name || u.username || username,
    totalXp: u.totalXp ?? 0,
    streak: u.streak ?? 0,
    courses: (u.courses || []).filter((c) => (c.xp || 0) > 0).map((c) => ({ title: c.title, xp: c.xp }))
  };
}

// Confirms a login token works and tells whose it is.
export async function checkToken(jwt) {
  const payload = decodeJwt(jwt);
  if (!payload || !payload.sub) return { ok: false, reason: "not a Duolingo login token (expected the jwt_token cookie value)" };
  if (payload.exp && payload.exp * 1000 < Date.now()) return { ok: false, reason: "the token has expired — log in to duolingo.com again and copy a fresh one" };
  try {
    const me = await getJson(`${API}/users/${payload.sub}?fields=id,username,name,totalXp`, jwt);
    return { ok: true, id: payload.sub, username: me.username, name: me.name, totalXp: me.totalXp };
  } catch (e) {
    return { ok: false, reason: `Duolingo rejected the token (${e.message})` };
  }
}

// Token-authorized reads of a user's account record — the number the app shows
// as "Total XP". Tries the account record and the friend-profile view; the
// largest total wins because every variant is a partial count of the same
// lifetime XP (the public one being the most partial).
export async function accountTotals(id, jwt) {
  // The web profile page reads Total XP from the 2023-05-23 account record by
  // id (token required); the older record and the friend view are backups.
  const attempts = [
    { source: "account-2023", url: `https://www.duolingo.com/2023-05-23/users/${id}?fields=id,username,name,totalXp,streak` },
    { source: "account", url: `${API}/users/${id}?fields=id,username,name,totalXp,streak` },
    { source: "friend-profile", url: `${API}/friends/users/${id}/profile` }
  ];
  let best = null;
  const notes = [];
  for (const a of attempts) {
    try {
      const j = await getJson(a.url, jwt);
      const totalXp = typeof j.totalXp === "number" ? j.totalXp : typeof (j.profile && j.profile.totalXp) === "number" ? j.profile.totalXp : null;
      const streak = typeof j.streak === "number" ? j.streak : null;
      notes.push(`${a.source}=${totalXp ?? "n/a"}`);
      if (totalXp !== null && (!best || totalXp > best.totalXp)) best = { totalXp, streak, source: a.source };
    } catch (e) {
      notes.push(`${a.source}: ${e.message}`);
    }
  }
  return { best, notes };
}

// XP earned per calendar day (tracker timezone) between two dates inclusive,
// as { "YYYY-MM-DD": xp }. Days Duolingo omits are recorded as 0 so the caller
// can tell "covered, nothing earned" from "not covered".
export async function dailyXp(id, jwt, startDate, endDate) {
  const url = `${API}/users/${id}/xp_summaries?startDate=${startDate}&endDate=${endDate}&timezone=${encodeURIComponent(TIMEZONE)}`;
  const json = await getJson(url, jwt);
  const list = Array.isArray(json.summaries) ? json.summaries : Array.isArray(json) ? json : null;
  if (!list) throw new Error("unexpected xp_summaries response");
  const out = {};
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) out[d] = 0;
  for (const s of list) {
    let day;
    if (typeof s.date === "number") day = new Date((s.date > 1e12 ? s.date : s.date * 1000)).toISOString().slice(0, 10);
    else if (s.date) day = String(s.date).slice(0, 10);
    if (!day || !(day in out)) continue;
    out[day] += Number(s.gainedXp || 0);
  }
  return out;
}
