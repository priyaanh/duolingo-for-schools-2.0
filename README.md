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

### 🍎 Teacher mode
- **Classrooms** — create classrooms, each with a shareable 6-character class code
- **Overview dashboard** — students, total XP, active-today count, average crowns
- **Roster management** — add/remove students, see XP, streaks 🔥, crowns 👑, and last-active dates
- **Assignments** — assign a skill with a due date; track who has turned it in, with overdue highlighting
- **Progress matrix** — a skills × students grid showing crown levels across the whole class

### 🎒 Student mode
- **Join a class** with the teacher's class code, or pick an existing profile
- **Assignment inbox** — see what's due (and what's overdue) and start it with one tap
- **Skill tree** — 8 Spanish skills (Basics, Greetings, Food, Animals, Family, Colors, Numbers, Phrases), each with 3 crown levels
- **Lesson player** with four exercise types:
  - Multiple choice (Spanish → English and English → Spanish)
  - Type-the-translation
  - Word-bank sentence building with distractor words
  - Tap-the-matching-pairs
- **Gamification** — hearts ❤️ (3 per lesson, missed questions are re-queued), XP with a perfect-lesson bonus, daily streaks, and crowns
- Completing a lesson automatically **turns in** any matching assignment, visible instantly on the teacher's dashboard

Everything persists in `localStorage`, and the app ships with a seeded demo classroom
(*Spanish 1 — Period 3*) so both dashboards are interesting from the first load.
Use **Reset demo** in the header to start fresh.

## 📈 Real XP tracker (track actual Duolingo accounts)

Since Duolingo for Schools is shutting down, this repo also includes a **real XP tracker** so a
teacher can keep seeing how much XP each student earns per week on the *real* Duolingo app:

- A GitHub Action ([.github/workflows/track-xp.yml](.github/workflows/track-xp.yml)) runs daily
  at 06:00 UTC, reads each student's **public** Duolingo profile (total XP and streak only),
  and commits a snapshot to [data/xp-history.json](data/xp-history.json).
- [tracker.html](tracker.html) turns those snapshots into a weekly leaderboard: XP this week,
  XP last week, weekly history per student, class totals, and streaks. Weeks start Monday (UTC).

### Adding the class (no student accounts needed)

Classmates don't need GitHub — they just tell whoever runs the repo their Duolingo username.
The owner then adds everyone in one paste:

1. Open the repo's **Actions** tab → **Add students** → **Run workflow**.
2. Paste the usernames (separated by spaces or commas) and press **Run workflow**.
3. The workflow checks each name against Duolingo (skipping typos, duplicates, and private
   profiles with a per-name explanation in the run summary), adds the valid ones to
   [data/usernames.json](data/usernames.json), and records everyone's XP immediately.
   The tracker page updates within a minute or two.

Students can also preview their XP anytime with the **Show my XP** box on the tracker page.

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
