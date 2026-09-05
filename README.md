# 🦜 Duolingo XP Tracker

A tracker that shows each student's **real Duolingo XP** on a weekly class leaderboard — built
for teachers whose classes practice on the real Duolingo app. Plain HTML/CSS/JavaScript, hosted
free on GitHub Pages, no backend to run.

> **Not affiliated with Duolingo.** This reads only **public** Duolingo profile data (total XP and
> streak — the same numbers anyone can see on a profile page) through Duolingo's public, unofficial
> profile endpoint. No logins or passwords are ever collected.

**Live:** `https://<user>.github.io/<repo>/tracker.html` (this repo:
https://priyaanh.github.io/duolingo-for-schools-2.0/tracker.html)

## How it works

- A GitHub Action ([.github/workflows/track-xp.yml](.github/workflows/track-xp.yml)) runs every
  night just after midnight Pacific time, reads each listed student's public Duolingo profile, and
  commits a snapshot of the day that just ended to [data/xp-history.json](data/xp-history.json).
- [tracker.html](tracker.html) turns those snapshots into a live dashboard. Weeks run **Monday
  00:00 → Sunday 23:59, US Pacific time** (the Sunday-night snapshot closes the week).

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

## Adding your class — no accounts needed

**On the tracker page, no GitHub:** open **👩‍🏫 Make your class**, type the students' Duolingo
usernames in the first box, the **teacher's username in its own box underneath**, and press
**✅ Make my class**. Everyone's real XP is looked up live and shown ranked by this week's
(Mon–Sun) XP, saved on that device. (A `teacher:` prefix in the students box also works.) Great
for a teacher's own screen or projecting in class. Tap **Share with the whole class** to also
publish it to the shared tracker (below) so students see it on their own devices and exact
nightly history builds up.

**Shared tracker (everyone sees it, with weekly history):**
- **From the tracker page:** open **➕ Add to the shared tracker** → paste all the usernames
  (with `teacher:` prefixes as needed) → it opens one prefilled GitHub request; submit it and the
  robot enrolls everyone and replies with a per-name report.
- **From GitHub:** **Actions** tab → **Add students** → **Run workflow** → paste the usernames.

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
3. Add your class (see above), then run **Track Duolingo XP** once by hand to record the first
   snapshot. After that it runs automatically every night.

> Notes: the profile endpoint is unofficial, so it could change or be rate-limited. XP "this week"
> is computed from snapshot differences, so the first week only counts XP earned after tracking
> started. Different timezone? Change `TIMEZONE` in [scripts/track-xp.mjs](scripts/track-xp.mjs)
> and [js/tracker.js](js/tracker.js), and shift the workflow cron to just after your local midnight.

## Project structure

```
tracker.html         # the tracker page (the site's main page; index.html redirects here)
js/tracker.js        # leaderboard, chart, goal, winners, search, CSV, add-class flows
css/styles.css       # styles
data/usernames.json  # the class list ("usernames" + "teachers")
data/xp-history.json # nightly snapshots (written by the workflow)
scripts/             # track-xp / add-usernames / join-request (Node, run by the workflows)
.github/workflows/   # Track Duolingo XP · Add students · Join tracker
```

## License

[MIT](LICENSE). "Duolingo" is a trademark of Duolingo, Inc., used here only to describe what this
project tracks.
