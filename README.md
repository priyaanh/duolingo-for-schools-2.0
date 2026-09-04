# 🦜 Duolingo for Schools 2.0 (Unofficial Remake)

A from-scratch, educational recreation of the **Duolingo for Schools** experience — a classroom
management dashboard for teachers paired with a gamified language-lesson player for students —
built as a single-page app in plain HTML, CSS, and JavaScript. No frameworks, no build step,
no backend.

> **Disclaimer:** This is an independent student project built for learning purposes.
> It is **not affiliated with, endorsed by, or connected to Duolingo, Inc.** in any way.
> No proprietary Duolingo assets, artwork, or course content are used — all code, styling,
> and demo content in this repository are original.

## ✨ Features

### 🚪 Login page & roles
- Everyone logs in: **teachers** with their dashboard PIN, **students** by tapping their
  profile or joining with the class code
- **Welcome back** — the device remembers the last student for one-tap login
- Students can set a personal **secret PIN** (at join time or from 🔑 PIN on their home),
  so classmates can't open their profile on a shared computer; teachers can reset a
  forgotten student PIN from the roster
- Students never see the teacher dashboard; opening it requires the teacher PIN.
  Teachers can preview the student view, **🔒 Lock** the dashboard when handing a device
  to students, and change their PIN anytime
- A **Load the demo classroom** link seeds sample data for anyone who just wants to explore
- Installable as an app (web manifest) — "Add to home screen" on Chromebooks and iPads
- **Automatic dark mode** on both pages (follows the device's light/dark setting), and the
  tracker prints cleanly — collapsed tables open themselves for the printout
- Note: the app is fully client-side, so PINs are classroom-level locks, not real authentication

### 🏆 Class leaderboard (practice XP)
- Teachers get a podium **Leaderboard tab** per classroom (gold/silver/bronze + ranked list)
- Students see a top-5 class leaderboard on their home screen, with a ⭐ on their own row
- Lessons support keyboard play: **1–4** picks an answer, **Enter** checks and continues

### 🍎 Teacher mode
- **Classrooms** — create classrooms, each with a shareable 6-character class code
- **Overview dashboard** — students, total XP, active-today count, average crowns
- **Roster management** — add/remove students, see XP, streaks 🔥, crowns 👑, and last-active dates
- **Assignments** — assign a skill with a due date; track who has turned it in, with overdue highlighting
- **Progress matrix** — a skills × students grid showing crown levels across the whole class

### 🎒 Student mode
- **Join a class** with the teacher's class code, or pick an existing profile
- **Assignment inbox** — see what's due (and what's overdue) and start it with one tap
- **Two courses** — 🇪🇸 Spanish and 🇫🇷 French, 8 skills each (Basics, Greetings, Food, Animals,
  Family, Colors, Numbers, Phrases) with 3 crown levels per skill; teachers pick the course per
  classroom (at creation or from the Overview tab)
- **Daily goal ring** — a 30-XP-per-day target on the student home that fills as you practice
- **Lesson player** with five exercise types:
  - Multiple choice (target language → English and English → target language)
  - **Listening** — tap the speaker, choose what you heard (browser text-to-speech)
  - Type-the-translation
  - Word-bank sentence building with distractor words
  - Tap-the-matching-pairs
- **Gamification** — hearts ❤️ (3 per lesson, missed questions are re-queued), XP with a perfect-lesson bonus, daily streaks, and crowns
- Completing a lesson automatically **turns in** any matching assignment, visible instantly on the teacher's dashboard

Everything persists in `localStorage`. The start screen's **Load the demo classroom** link
seeds a sample class (*Spanish 1 — Period 3*) so both dashboards are interesting immediately,
and **Reset** in the header erases everything on the device and returns to the start screen.

## 📈 Real XP tracker (track actual Duolingo accounts)

Since Duolingo for Schools is shutting down, this repo also includes a **real XP tracker** so a
teacher can keep seeing how much XP each student earns per week on the *real* Duolingo app:

- A GitHub Action ([.github/workflows/track-xp.yml](.github/workflows/track-xp.yml)) runs every
  night just after midnight Pacific time, reads each student's **public** Duolingo profile
  (total XP and streak only), and commits a snapshot of the day that just ended to
  [data/xp-history.json](data/xp-history.json).
- [tracker.html](tracker.html) turns those snapshots into a weekly leaderboard: XP this week,
  XP last week, weekly history per student, class totals, and streaks. **Weeks run Monday
  00:00 through Sunday 23:59, US Pacific time** — the Sunday-night snapshot closes the week.
  (Different timezone? Change `TIMEZONE` in [scripts/track-xp.mjs](scripts/track-xp.mjs) and
  [js/tracker.js](js/tracker.js), and shift the cron in the workflow to just after your local
  midnight.)

### Adding the class (no student accounts needed)

Classmates don't need GitHub — they just tell whoever runs the tracker their Duolingo username.
Then add everyone in one paste, either way:

- **From the tracker page:** open **➕ Add yourself** → paste all the usernames into the
  **Adding the whole class?** box → it opens one prefilled GitHub request (`join: name1 name2 …`)
  — submit it and the robot enrolls everyone and replies with a per-name report.
- **From GitHub:** **Actions** tab → **Add students** → **Run workflow** → paste the usernames.

Either way, each name is checked against Duolingo (typos, duplicates, and private profiles are
skipped with an explanation), added to [data/usernames.json](data/usernames.json), and everyone's
XP is recorded immediately. The tracker page updates within a minute or two.

Students can also preview their XP anytime with the **Show my XP** box on the tracker page.

**Teachers on the tracker:** add the teacher's Duolingo username to `usernames` as usual, and
also list it under `"teachers"` in [data/usernames.json](data/usernames.json). Teacher profiles
get a 🍎 Teacher badge, sit below the student leaderboard instead of competing on it, and are
excluded from the class XP totals.

### Optional: self-serve joining (needs a GitHub account)

Anyone **with** a free GitHub account can add themselves: the **Join the class tracker** button
opens a prefilled issue titled `join: <username>`, and the
[Join tracker workflow](.github/workflows/join.yml) verifies the profile, enrolls it, takes an
immediate snapshot, replies, and closes the issue. The tracker page polls and refreshes itself
once the data lands.

### Setup (one time)

1. On GitHub, open the **Actions** tab and enable workflows if prompted.
2. Run **Track Duolingo XP** once manually (Actions → Track Duolingo XP → Run workflow) to record
   the first snapshot. After that it runs automatically every day.
3. The teacher bookmarks the tracker page — with GitHub Pages enabled it's at
   `https://<user>.github.io/duolingo-for-schools-2.0/tracker.html`.

> Notes: this uses Duolingo's public, unofficial profile endpoint, so it only reads data anyone
> can already see on a profile page — but the endpoint isn't officially supported and could
> change or be rate-limited. XP "this week" is computed from snapshot differences, so the first
> week only counts XP earned after tracking started.

## 🚀 Running it

No install needed — it's a static site.

```bash
# Option 1: just open it
open index.html

# Option 2: serve it locally
python3 -m http.server 8000
# then visit http://localhost:8000
```

Or enable **GitHub Pages** (Settings → Pages → deploy from the `main` branch, root folder)
to host it live.

## 🗂 Project structure

```
index.html      # app shell
css/styles.css  # original Duolingo-inspired design system
js/data.js      # course content: 8 skills, 64 words, 32 sentences (original demo material)
js/app.js       # state, routing, teacher views, student views, lesson engine
```

## 🧭 Roadmap ideas

- More courses (French, Japanese, …) and per-classroom course selection
- Listening exercises via the Web Speech API
- A real backend (accounts, sync across devices) and teacher authentication
- Leaderboards and weekly XP goals per classroom

## 📄 License

[MIT](LICENSE) — original code and demo content only. The name "Duolingo" is a trademark of
Duolingo, Inc., used here only to describe what this project is a fan remake of.
