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
