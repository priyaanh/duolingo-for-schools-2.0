# 🦜 Duolingo XP Tracker

A tracker that shows each student's **real Duolingo XP** on a weekly class leaderboard — built
for teachers whose classes practice on the real Duolingo app. Plain HTML/CSS/JavaScript, hosted
free on GitHub Pages, no backend to run.

> **Not affiliated with Duolingo.** The tracker reads Duolingo's own records: public profile data
> for anyone, and — once a Duolingo login token is connected — the same account records the
> Duolingo app itself reads. No passwords are ever collected or stored.

**Live:** `https://<user>.github.io/<repo>/tracker.html` (this repo:
https://priyaanh.github.io/duolingo-for-schools-2.0/tracker.html)

## Where the numbers come from

Duolingo has no developer program and issues no API keys, so there are exactly two ways to read
XP, and the tracker uses both:

| | Public profile (no token) | Duolingo account records (token) |
|---|---|---|
| Who can read it | anyone | the nightly robot, with a login token |
| **Total XP** | **language courses only** — Duolingo Math and Music XP are left out, so it can be far below the app's Total XP | the app's full **Total XP** |
| **Weekly XP** | difference between nightly totals — only counts XP since tracking began | **exact XP per day** from Duolingo, Monday to Sunday |
| Streak | yes | yes |

Example: a profile whose app shows **103,813 Total XP** reports only **50,250** on the public
endpoint (its Spanish + Hindi + English + French XP) — everything earned in Math and Music is
missing. The badge at the top of the tracker says which mode it is in: 🟡 public-profile data,
or 🟢 connected.

## How it works

- A GitHub Action ([.github/workflows/track-xp.yml](.github/workflows/track-xp.yml)) runs every
  night just after midnight Pacific time, reads each listed member's Duolingo records, and commits
  a snapshot of the day that just ended to [data/xp-history.json](data/xp-history.json). With a
  token it also stores each member's XP for each of the last 14 days, so weekly numbers are exact
  even for the week tracking started.
- [tracker.html](tracker.html) turns those snapshots into a dashboard. Weeks run **Monday
  00:00 → Sunday 23:59, US Pacific time** (the Sunday-night snapshot closes the week).
- Live lookups on the page (Make your class, Show my XP) can only use public profiles, so they
  show language-course XP and say so.

## Connect to Duolingo (full Total XP and exact weekly XP)

One-time setup by **whoever runs the tracker only** — students never touch GitHub. A single token
from one Duolingo account (yours or the teacher's) lets the robot read every class member's full
Total XP. The token goes into a GitHub **secret**: the robot can use it, but it is never shown on
the page or written into the project.

1. In Chrome or Edge on a computer, log in at [duolingo.com](https://www.duolingo.com).
2. Open developer tools (`F12`, or `⌥⌘I` on a Mac) → **Application** tab → **Cookies** →
   `https://www.duolingo.com` → click the `jwt_token` row and copy its **Value**.
3. In this repo: **Settings** → **Secrets and variables** → **Actions** → **New repository
   secret** → Name `DUOLINGO_JWT`, Secret = the token → **Add secret**.
4. **Actions** → **Track Duolingo XP** → **Run workflow**. The run's summary page reports whether
   the token was accepted and lists every member's full Total XP next to the public number.

Keep the token private — it acts as a login to that account. Logging out of Duolingo everywhere
(or changing the password) invalidates it; repeat the steps to install a fresh one. If the token
ever stops working, the robot says so in the run log and falls back to public data automatically.

To see exactly what Duolingo reports for someone, from a computer with Node installed:

```
node scripts/check-duolingo.mjs priyaanh                      # public numbers
DUOLINGO_JWT=<token> node scripts/check-duolingo.mjs priyaanh # full Total XP + XP per day
```

## Features

- **Leaderboard** — podium + ranked list, toggle between *this week* and *all time*.
- **Weekly class goal** — a shared XP target with a progress bar (teacher-adjustable).
- **XP-per-day chart** — the whole class's daily XP over the last two weeks.
- **Weekly winners** — a hall of fame crowning each completed week's top student.
- **Streak alerts** — flags anyone whose real Duolingo streak just broke (💔).
- **Search + trend sparklines** — filter the roster by name, and see each student's weekly trend.
- **Teacher detection** — teachers get a 🍎 badge, sit out of the student ranking, and are left
  out of class totals.
- **CSV export** — download everyone's weekly XP, totals, and streaks for a gradebook.
- **Dark mode** (follows the device) and a clean **print** layout.

## Adding your class — students never need an account

**Students:** open the tracker link, type the **class code** and their **Duolingo username**, done.
The page drops the request in the robot's inbox and the robot adds them within about 15 minutes.
No GitHub, no sign-ups. The same inbox powers **➕ Add to the shared tracker** (one name or a whole
pasted list) and **Share with the whole class** in the device-local **👩‍🏫 Make your class** box.

**Whoever runs the tracker** can also add names from GitHub: **Actions** tab → **Add students** →
**Run workflow** → paste the usernames (`teacher:` prefix marks the teacher). That's also where the
class code is set.

Either way each name is checked against Duolingo (typos, duplicates, and private profiles are
skipped with an explanation) and added to [data/usernames.json](data/usernames.json). Profiles
must not be set to private (Duolingo → Settings → Privacy).

Mark teachers three ways: the `teacher:` prefix when pasting, the per-row **🍎 Make teacher**
toggle in the device list, or by hand under `"teachers"` in
[data/usernames.json](data/usernames.json).

## Class code (students unlock the board)

When a class code is set, opening the tracker shows a **🔒 Enter your class code** screen:
students type the code the teacher gave them (once per device) and the weekly Monday–Sunday
XP board unlocks — with an optional "your username" field that puts a ⭐ on their own row.

- **Set or change the code:** Actions → **Add students** → Run workflow → fill the
  **class_code** field (usernames may be left empty). Enter `off` to remove the code.
- Changing the code automatically re-locks every device.
- This is a classroom-level lock on a public static site (the data files remain publicly
  readable in the repo) — it keeps strangers from stumbling onto the board, not a security
  system.

## Setup (one time)

1. Enable **GitHub Pages** (Settings → Pages → deploy from the `main` branch, root folder).
2. Open the **Actions** tab and enable workflows if prompted.
3. Add your class (see above), connect a Duolingo token (see above), then run
   **Track Duolingo XP** once by hand to record the first snapshot. After that it runs
   automatically every night.

> Notes: Duolingo's endpoints are unofficial, so they could change or be rate-limited. Different
> timezone? Change `TIMEZONE` in [scripts/duolingo.mjs](scripts/duolingo.mjs) and
> [js/tracker.js](js/tracker.js), and shift the workflow cron to just after your local midnight.

## Project structure

```
tracker.html         # the tracker page (the site's main page; index.html redirects here)
js/tracker.js        # leaderboard, chart, goal, winners, search, CSV, add-class flows
css/styles.css       # styles
data/usernames.json  # the class list ("usernames" + "teachers")
data/xp-history.json # nightly snapshots (written by the workflow)
scripts/duolingo.mjs # shared Duolingo reads (public profile, token reads, XP per day)
scripts/             # track-xp / check-duolingo / add-usernames / join-request (Node)
.github/workflows/   # Track Duolingo XP · Add students · Join tracker
```

## License

[MIT](LICENSE). "Duolingo" is a trademark of Duolingo, Inc., used here only to describe what this
project tracks.
