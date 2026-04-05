# PrincipleLearn V3

AI-powered Learning Management System for thesis research on Critical Thinking and Computational Thinking skill development. Built with Next.js 15, Supabase, and OpenAI.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Styling | Sass modules (`.module.scss`) |
| Database | Supabase PostgreSQL with RLS policies |
| Auth | Custom JWT (access + refresh tokens, CSRF double-submit) |
| AI | OpenAI API — course generation, Q&A, challenge thinking |
| Deployment | Vercel |
| Testing | Jest (API/unit), Playwright (E2E) |

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project ([supabase.com](https://supabase.com))
- OpenAI API key (for AI features)

### Setup

```bash
git clone https://github.com/GlennAyden/PrincipleLearnV2.git
cd PrincipleLearnV2
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-5-mini          # optional, this is the default
```

### Run

```bash
npm run dev          # Development server at http://localhost:3000
npm run build        # Production build
npm run start        # Production server
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (Fast Refresh disabled for stability) |
| `npm run dev:no-lint` | Dev server without ESLint |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm test` | Run all Jest tests |
| `npm run test:watch` | Jest in watch mode |
| `npm run test:coverage` | Jest with coverage report |
| `npm run test:unit` | API tests only (`tests/api/`) |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:all` | Jest + Playwright |

Run a single test: `npx jest tests/api/auth/login.test.ts`

## Project Structure

```
src/
├── app/                  # Next.js App Router
│   ├── api/              # API route handlers
│   │   ├── auth/         # Login, register, refresh, logout
│   │   ├── admin/        # Admin endpoints (users, activity, dashboard)
│   │   └── ...           # AI generation, quiz, journal, etc.
│   ├── admin/            # Admin dashboard pages
│   ├── course/           # Course viewing & learning pages
│   └── request-course/   # Multi-step course creation (step1-3)
├── components/           # Feature-organized React components
├── services/             # Business logic (auth, course, ai)
├── lib/                  # Infrastructure (database, jwt, schemas, rate-limit)
├── hooks/                # Custom hooks (useAuth, useSessionStorage)
├── context/              # React Context (RequestCourseContext)
└── types/                # TypeScript definitions
```

## Key Features

- **AI Course Generation** — multi-step form → OpenAI generates structured course outline → stored in Supabase
- **Interactive Learning** — subtopic pages with quiz, Q&A, challenge thinking, examples, structured reflection
- **Socratic Discussion** — AI-guided discussion sessions with phase tracking
- **Admin Dashboard** — user management, activity monitoring, research analytics, discussion management
- **Research Data** — prompt classification, cognitive indicators, learning session tracking (for thesis RM2 & RM3)

## Deployment (Vercel)

1. Connect GitHub repo to [Vercel](https://vercel.com)
2. Set environment variables in Vercel dashboard (same as `.env.local`)
3. Deploy — Vercel auto-builds on push

Production config: `vercel.json` sets `maxDuration: 60` for AI routes. Build settings are in `next.config.ts`.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Module not found | `rm -rf node_modules && npm install` |
| DB connection failed | Check Supabase URL/keys in `.env.local` |
| Auth not working | Verify `JWT_SECRET` matches across environments |
| AI timeout | Check `OPENAI_API_KEY`, increase `maxDuration` in `vercel.json` |
| Port 3000 in use | `npx kill-port 3000` or use `npm run dev -- -p 3001` |

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — AI assistant instructions
- [`AGENTS.md`](AGENTS.md) — Contributor guidelines
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture & database schema
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) — API endpoint reference
- [`docs/thesis/`](docs/thesis/) — Academic/pedagogical documentation for thesis

## License

MIT
