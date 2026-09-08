# Novi

> Your personal AI study buddy.

Novi is an AI-powered study companion designed to help students study smarter through personalized guidance, practice, and progress tracking.

Instead of simply generating summaries or answering questions, Novi learns how each student learns and adapts its recommendations, explanations, and practice over time.

## ✨ Features

- 🤖 **Personal AI Study Buddy** - Create and customize your own study companion.
- 📚 **Study Materials** - Upload PDFs, presentations, documents, images, or notes.
- 🧠 **AI-Powered Study Content** - Generate summaries, key concepts, explanations, and practice questions.
- 🎯 **Personalized Learning** - Novi identifies strengths and weaknesses and adapts to your learning style.
- 📈 **Progress Tracking** - Track study sessions, quiz performance, and topic mastery.
- 💡 **Smart Recommendations** - Novi recommends what you should study next based on your progress.
- 🔐 **Secure Accounts** - Your study history and personalization are saved to your account.

## 🛠️ Tech Stack

- **Frontend:** Vite, React 19, JavaScript
- **Routing:** React Router
- **Backend & Database:** Supabase, PostgreSQL
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage
- **Vector search:** pgvector
- **AI:** LLM APIs, called from Supabase Edge Functions
- **Machine Learning:** Python
- **Deployment:** TBD

> Vite is client-only, so LLM API keys can never live in this app. Content generation,
> embedding, and the learning engine must run in Edge Functions or the Python service.

## 🚀 Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase URL and publishable key
npm run dev
```

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:5173 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint` | oxlint |

## ✅ What works today

The first vertical slice of the flow, running against the real database:

1. **Create an account** — signup writes to Supabase Auth. A database trigger
   (`on_auth_user_created`) automatically creates the matching `profiles` and
   `learning_profile` rows.
2. **Name your buddy** — `/buddy/new`. Every signed-in route redirects here until a buddy
   exists, so onboarding order holds no matter which URL you land on.
3. **Upload material** — drag-and-drop or browse. The file goes to the private
   `study-materials` bucket at `<user_id>/<material_id>/<filename>`, then a `materials` row
   records it. A failed insert deletes the uploaded object so the bucket never collects
   orphans.
4. **Dashboard** — lists your material with its processing status.

Email confirmation is **on** in Supabase, so a new account has to confirm before signing in.

## 🚧 Not built yet

- Material processing: text extraction, chunking, embedding (`material_chunks.embedding`)
- Content generation: summaries, key concepts, questions
- Studying with the buddy: sessions, attempts, chat
- The learning engine: mastery, insights, recommendations

The database tables for all of the above already exist.

## 📁 Project layout

```
src/
  components/   AppLayout, Mascot, ProtectedRoute, FullPageLoader
  context/      auth-context.js (context + useAuth), AuthProvider.jsx
  lib/          supabase.js (client), materials.js (upload + validation)
  pages/        Landing, SignIn, SignUp, CreateBuddy, Dashboard, Upload
  index.css     design tokens + shared component styles
  App.css       layout and page styles
```

## 🗄️ Database

The schema lives in the Supabase project as 8 migrations. **They are not yet mirrored into
this repo.** To pull them down:

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db pull
```

18 tables, grouped as:

| Group | Tables |
| --- | --- |
| Identity | `profiles`, `buddies` |
| Material | `subjects`, `topics`, `materials`, `material_chunks` |
| Generated content | `study_sets`, `summaries`, `key_concepts`, `questions` |
| Studying | `study_sessions`, `question_attempts`, `chat_messages` |
| Learning engine | `topic_mastery`, `learning_profile`, `learning_insights`, `recommendations`, `daily_activity` |

Every table has row level security enabled, and `user_id` is denormalized onto all of them so
each policy is a flat `(select auth.uid()) = user_id` check rather than a join.

`match_material_chunks()` does cosine retrieval over the calling student's own chunks. It is
`security invoker`, so RLS still applies — a student can never match against someone else's
material.

## 🎨 Design

Modern and minimal. White and light backgrounds, coral (`#ff6b5a`) as the only accent, no
gradients, rounded cards, soft shadows. Tokens are defined at the top of `src/index.css`;
use those variables rather than hardcoding colors.
