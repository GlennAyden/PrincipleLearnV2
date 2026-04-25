# PrincipleLearn V3

AI-powered Learning Management System for thesis research on Critical Thinking and Computational Thinking skill development. Built with Next.js 15, Supabase, and OpenAI.

The application is intentionally Indonesian (jurnal, riset, siswa, aktivitas, ekspor, bukti, kognitif, triangulasi). There is a single admin (the researcher); all other users are research participants. The codebase is the reference implementation for the author's Magister thesis.

## Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Framework | Next.js 15.5 (App Router), React 19, TypeScript strict |
| Styling | Sass modules (`.module.scss`) |
| Database | Supabase PostgreSQL (35 public tables) with RLS policies |
| Auth | Custom JWT (access + refresh) with CSRF double-submit cookie |
| AI | OpenAI SDK 4.96 — course generation, Q&A, challenge thinking, classification, scoring |
| Validation | Zod 4.3 (19 schemas in `src/lib/schemas.ts`) |
| Deployment | Vercel (region `sin1`, `maxDuration: 60s` for AI routes) |
| Testing | Jest 30 + Playwright 1.58 + MSW |

## Getting Started

### Prerequisites

- **Node.js 22.x** (declared in `package.json#engines.node`)
- A Supabase project ([supabase.com](https://supabase.com))
- An OpenAI API key (required for AI features)

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
JWT_SECRET=your-jwt-secret
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-5-mini                     # optional, this is the default
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
ENABLE_PRODUCTION_ACTIVITY_SEED=false       # leave false for research projects
```

`next.config.ts` force-loads `.env` and `.env.local` with override so a stray global `OPENAI_API_KEY` cannot accidentally take precedence.

See [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) for the full setup walkthrough including Supabase migrations.

### Run

```bash
npm run dev          # Dev server at http://localhost:3000 (Fast Refresh disabled)
npm run build        # Production build
npm run start        # Production server
```

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Dev server (Fast Refresh disabled for stability) |
| `npm run dev:no-lint` | Dev server without ESLint |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run lint` | ESLint (flat config) |
| `npm test` | Run all Jest tests |
| `npm run test:watch` | Jest watch mode |
| `npm run test:coverage` | Jest with coverage report |
| `npm run test:unit` | Jest, `tests/api/` only |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:e2e:user` | Playwright, user flows only |
| `npm run test:e2e:admin` | Playwright, admin flows only |
| `npm run test:e2e:admin:smoke` | Playwright admin smoke (chromium only) |
| `npm run test:e2e:ui` | Playwright interactive UI |
| `npm run test:e2e:headed` | Playwright headed mode |
| `npm run test:all` | Jest then Playwright |
| `npm run test:ci` | CI: Jest `--ci --coverage` then Playwright |
| `npm run playwright:install` | Install Playwright browsers |
| `npm run test:api-legacy` | Legacy `ts-node` admin/user API smoke |
| `npm run test:dataflow` | Legacy `ts-node` API endpoint smoke |

Run a single test: `npx jest tests/api/auth/login.test.ts`

## Project Structure

```text
src/
├── app/                       # Next.js App Router
│   ├── api/                   # 47+ route handlers
│   │   ├── auth/              # login, logout, refresh, register, me
│   │   ├── admin/             # activity, dashboard, discussions, insights,
│   │   │                      # monitoring, research, siswa, users
│   │   ├── courses/           # course CRUD ([id], list)
│   │   ├── discussion/        # history, prepare, respond, start, status
│   │   ├── ask-question/      # streaming Q&A
│   │   ├── challenge-thinking/ challenge-feedback/ challenge-response/
│   │   ├── generate-course/ generate-subtopic/ generate-examples/
│   │   ├── jurnal/            # save, status
│   │   ├── learning-profile/ learning-progress/ onboarding-state/
│   │   ├── prompt-journey/    # prompt revision history
│   │   ├── quiz/              # regenerate, status, submit
│   │   ├── user-progress/
│   │   └── debug/             # dev-only utilities
│   ├── admin/                 # Indonesian admin pages: aktivitas/, dashboard/,
│   │                          # ekspor/, riset/, siswa/, login/, register/
│   ├── course/[courseId]/     # student course viewer
│   ├── dashboard/             # student dashboard
│   ├── onboarding/            # profile wizard + intro/ slide deck
│   ├── request-course/        # multi-step creation: step1, step2, step3, generating
│   ├── login/  signup/  logout/
├── components/                # AILoadingIndicator/, AskQuestion/, ChallengeThinking/,
│                              # Examples/, HelpDrawer/, KeyTakeaways/, NextSubtopics/,
│                              # ProductTour/, PromptBuilder/, PromptTimeline/, Quiz/,
│                              # ReasoningNote/, StructuredReflection/, WhatNext/, admin/
├── services/                  # auth, course, ai, cognitive-scoring,
│                              # prompt-classifier, research-auto-coder,
│                              # research-data-reconciliation, research-field-readiness,
│                              # research-session, discussion/
├── lib/                       # database, schemas (19 Zod), api-client, api-middleware,
│                              # api-logger, jwt, rate-limit, openai, plus per-feature
│                              # helpers (admin-*, quiz-*, reflection-*, research-*)
├── hooks/                     # useAdmin, useAuth, useDebouncedValue,
│                              # useLearningProgress, useLocalStorage,
│                              # useOnboardingState, useSessionStorage
├── context/RequestCourseContext.tsx
├── styles/  global.d.ts  types/
middleware.ts                  # Auth, role gate, two-stage onboarding gate, CSRF
docs/                          # ARCHITECTURE, API_REFERENCE, SECURITY,
                               # DATABASE_SCHEMA, SETUP_GUIDE, DEPLOYMENT,
                               # TESTING, USER_GUIDE, admin-and-research-ops,
                               # feature-flows, thesis/, sql/
supabase/                      # config.toml, migrations/
tests/                         # api/, unit/, e2e/, fixtures/, setup/, types/
scripts/                       # legacy ts-node smoke scripts + ops mjs
```

## Key Features

- **AI course generation** — multi-step form (`request-course/step1-3`) collects topic, audience, depth → OpenAI generates a structured outline → persisted in `courses` + `subtopics` + `leaf_subtopics`.
- **Atomic leaf-subtopic learning** — each subtopic broken into atomic leaves with per-leaf quiz attempt tracking for fine-grained progress.
- **Interactive learning** — quiz, ask-question (streaming), challenge thinking (streaming), examples on demand, structured reflection, key takeaways, what-next suggestions, reasoning notes.
- **Prompt journey & timeline** — every revision of a student's prompt captured in `prompt_revisions`; visualized via the `PromptTimeline` component and `/api/prompt-journey`.
- **Learning profile + onboarding** — two-stage cookie gate enforces the profile wizard (`/onboarding`) and educational intro slides (`/onboarding/intro`); server source of truth is `learning_profiles`.
- **Learning sessions** — `learning_sessions` rows track active study time and feed analytics.
- **Socratic discussion module** — fully implemented (`/api/discussion/*`, `discussion_*` tables, `services/discussion/`) but not in active use for the current thesis run.
- **Admin dashboard (Indonesian)** — `/admin/dashboard`, `/admin/siswa`, `/admin/aktivitas`, `/admin/ekspor`, and the research suite under `/admin/riset/{bukti,kognitif,prompt,readiness,triangulasi}`.
- **Research pipeline (RM2 / RM3)** — prompt classification (`prompt_classifications`), cognitive indicators (`cognitive_indicators`, `auto_cognitive_scores`), evidence ledger (`research_evidence_items`), auto-coder runs (`research_auto_coding_runs`), triangulation (`triangulation_records`), inter-rater reliability (`inter_rater_reliability`). Endpoints under `/api/admin/research/`.
- **Discussion templates** — `discussion_templates` + `services/discussion/generateDiscussionTemplate.ts` for AI-prepared discussion prompts.
- **Security hardening** — JWT + refresh rotation, CSRF double-submit, rate limiting (`rate_limits` table), prompt-injection defenses (`sanitizePromptInput()` + XML boundaries) on all OpenAI calls.

## Deployment (Vercel)

1. Connect the GitHub repo to [Vercel](https://vercel.com).
2. Set environment variables in the Vercel dashboard (same list as `.env.local`).
3. Push to `main` (or the configured production branch) — Vercel auto-builds.

Production config: `vercel.json` pins region `sin1` and sets `maxDuration: 60s` for `src/app/api/**` so AI streaming routes have headroom. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Troubleshooting

| Problem | Solution |
| ------- | -------- |
| Module not found | `rm -rf node_modules && npm install` |
| DB connection failed | Check Supabase URL/keys in `.env.local`; verify project not paused |
| Auth not working | Verify `JWT_SECRET` matches across environments; clear cookies and retry |
| CSRF 403 on POST | Confirm the client uses `apiFetch()` from `src/lib/api-client.ts` |
| Stuck on onboarding | Manually clear `onboarding_done` / `intro_slides_done` cookies, or update `learning_profiles.intro_slides_completed` via Supabase |
| AI timeout | Verify `OPENAI_API_KEY`; bump `maxDuration` in `vercel.json` if necessary |
| Port 3000 in use | `npx kill-port 3000` or `npm run dev -- -p 3001` |

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — Instructions for Claude Code working in this repo
- [`AGENTS.md`](AGENTS.md) — Contributor & AI-agent guidelines
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System architecture
- [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) — API endpoint reference
- [`docs/SECURITY.md`](docs/SECURITY.md) — Auth, CSRF, RLS, prompt-injection defense
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) — All 35 tables with relationships
- [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) — Detailed setup including Supabase migrations
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — Vercel deployment notes
- [`docs/TESTING.md`](docs/TESTING.md) — Jest + Playwright conventions and fixtures
- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — End-user / participant walkthrough
- [`docs/admin-and-research-ops.md`](docs/admin-and-research-ops.md) — Admin runbook & research ops
- [`docs/feature-flows.md`](docs/feature-flows.md) — Feature-by-feature flow diagrams
- [`docs/thesis/`](docs/thesis/) — Academic / pedagogical documentation (RM, learning theory, rubric, milestones)

## License

MIT
