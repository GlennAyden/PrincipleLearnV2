# PrincipleLearn V3 — Setup & Installation Guide

Audience: developers onboarding to local development.
Goal: clone the repo, install dependencies, provision Supabase, run the dev server, and execute the test suites.

> Framework: Next.js 15 (App Router) · React 19 · TypeScript 5 · Sass modules
> Database: Supabase (PostgreSQL 17) with RLS
> AI: OpenAI API
> Last verified against: [`package.json`](../package.json), [`.env.example`](../.env.example), [`vercel.json`](../vercel.json), [`supabase/config.toml`](../supabase/config.toml)

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Environment Configuration](#3-environment-configuration)
4. [Supabase Database Setup](#4-supabase-database-setup)
5. [First Admin User](#5-first-admin-user)
6. [Running the Development Server](#6-running-the-development-server)
7. [Running the Test Suites](#7-running-the-test-suites)
8. [Available npm Scripts](#8-available-npm-scripts)
9. [Project Structure Overview](#9-project-structure-overview)
10. [IDE Setup (VS Code, optional)](#10-ide-setup-vs-code-optional)
11. [Path Aliases](#11-path-aliases)
12. [Troubleshooting](#12-troubleshooting)
13. [Next Steps](#13-next-steps)

---

## 1. Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | **22.x** (LTS) | Pinned in [`package.json`](../package.json) (`engines.node = "22.x"`). Vercel uses the same runtime. |
| **npm** | 10+ | Bundled with Node 22. The repo ships a `package-lock.json`. |
| **Git** | 2.30+ | — |
| **Supabase project** | Free tier OK for dev | Sign up at [supabase.com](https://supabase.com/). |
| **Supabase CLI** (optional) | matches devDep `supabase ^2.91.3` | Only needed if you want to push migrations from the CLI instead of pasting SQL into the dashboard. |
| **OpenAI API key** | — | Required for course generation, Q&A streaming, challenge feedback, and example generation. |
| **Code editor** | — | VS Code recommended (see Section 10). |

Verify your runtime:

```bash
node --version    # v22.x.x
npm --version     # 10.x.x or higher
git --version     # 2.30+
```

If your machine has multiple Node versions installed, use [nvm](https://github.com/nvm-sh/nvm) (macOS/Linux) or [nvm-windows](https://github.com/coreybutler/nvm-windows) to switch to 22.x for this project.

---

## 2. Clone & Install

```bash
git clone <repository-url>
cd "Media V3"
npm install
```

`npm install` resolves the locked dependency tree from [`package-lock.json`](../package-lock.json). Key runtime packages:

- `next` 15.5, `react` 19, `react-dom` 19
- `@supabase/supabase-js` 2.99
- `openai` 4.96
- `zod` 4.3
- `bcrypt` 6 (with `bcryptjs` 3 as a pure-JS fallback)
- `jsonwebtoken` 9
- `sass` 1.87, `cross-env` 7

Dev/test packages: `jest` 30, `@playwright/test` 1.58, `ts-jest` 29, `msw` 2, `puppeteer` 24, `supabase` CLI 2.91.

### Install Playwright browser binaries (only if you will run E2E tests)

```bash
npm run playwright:install
```

This downloads Chromium (and Pixel 5 device profiles) used by [`playwright.config.ts`](../playwright.config.ts).

---

## 3. Environment Configuration

### 3.1 Copy the example env file

```bash
cp .env.example .env.local
```

Windows (cmd):

```cmd
copy .env.example .env.local
```

`.env.local` is git-ignored. Both [`next.config.ts`](../next.config.ts) and the helper scripts in [`scripts/`](../scripts/) load it via `dotenv` with `override: true`.

### 3.2 Required variables

From [`.env.example`](../.env.example):

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (`https://<ref>.supabase.co`). Exposed to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon key. Exposed to the browser; respects RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key. **Server-only.** Used by `adminDb` and bypasses RLS. |
| `JWT_SECRET` | yes | HMAC secret for access/refresh JWTs. Use 64+ random chars. **Server-only.** |
| `OPENAI_API_KEY` | yes (for AI features) | OpenAI key. Server-only. |
| `OPENAI_MODEL` | no | Defaults to `gpt-5-mini`. |
| `NEXT_PUBLIC_APP_URL` | recommended | App base URL. In dev, `http://localhost:3000`. |
| `ENABLE_PRODUCTION_ACTIVITY_SEED` | no | Keep `false` in dev. Only flip to `true` if you intentionally seed demo data into a non-research production project. |
| `ENABLE_DEBUG_ROUTES` | no | Not needed in dev. In production it enables `/api/debug/*` even when `NODE_ENV=production` (still requires admin role). |

Generate a strong `JWT_SECRET`:

```bash
openssl rand -hex 64
```

> Security: `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` must never appear in client-side code, repo history, or screenshots. Both bypass user-level access control.

---

## 4. Supabase Database Setup

### 4.1 Create a Supabase project

1. Open [supabase.com](https://supabase.com/), create a new project (PostgreSQL 17 is the default; this repo targets it — see [`supabase/config.toml`](../supabase/config.toml) `major_version = 17`).
2. Choose a region close to you (production deploys to `sin1`; dev region can be anywhere).
3. From **Project Settings → API**, copy the URL, anon key, and service-role key into `.env.local`.

### 4.2 Apply the schema

The repository contains two migration sources. **Use the canonical Supabase CLI directory.**

| Location | Status | Use when |
|----------|--------|----------|
| [`supabase/migrations/`](../supabase/migrations/) | **Canonical** — 60 timestamped files, kept in sync with the live schema. | Always. This is what `supabase db push` applies. |
| [`docs/sql/`](sql/) | Legacy reference — 31 hand-edited files retained for documentation and one-off backfills. | Only when explicitly noted in a doc, or to inspect a specific change. |

#### Option A — Supabase CLI (recommended)

Install the CLI (or use the dev dependency: `npx supabase --help`), then link and push:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

This applies every file in [`supabase/migrations/`](../supabase/migrations/) in timestamp order, including:

- baseline tables (users, courses, subtopics, quiz, jurnal, transcript, feedback, discussion_*, api_logs, rate_limits, subtopic_cache, ask_question_history, challenge_responses, learning_sessions, …)
- RLS policies (`20260405092645_add_rls_policies_all_tables.sql`)
- admin/research helper functions (`get_admin_user_stats`, `get_jsonb_columns`)
- security & schema hardening phases A–D (`20260415200707…20260415202444`)
- research/coder pipeline tables (`thesis_stage2…stage4`, `auto_cognitive_scores`, `discussion_assessment_research_model`)
- onboarding, refresh-token hashing, leaf-subtopic RPCs, transcript hygiene, etc.

#### Option B — Paste SQL into the dashboard

If you cannot use the CLI, open **SQL Editor → New Query** in the Supabase dashboard and run the files from [`supabase/migrations/`](../supabase/migrations/) in lexical (timestamp) order. Skip nothing — later phases assume earlier ones ran.

### 4.3 Verify

After migrations succeed, the database has ~35 public tables with RLS enabled on every table. Spot-check via **Table Editor**: each table row in the sidebar should show a green "RLS enabled" badge.

You can also verify connectivity once the dev server is running:

```bash
curl http://localhost:3000/api/test-db
```

A `200` JSON response confirms `adminDb` and `publicDb` can both reach Supabase.

---

## 5. First Admin User

`/api/admin/register` requires an **existing** admin to call it (see [`src/app/api/admin/register/route.ts`](../src/app/api/admin/register/route.ts), lines 11–48). For a brand-new project there is no admin yet, so create the first one manually:

1. Start the dev server (Section 6) and register a normal user at `http://localhost:3000/signup`.
2. In the Supabase dashboard, open **Table Editor → users** and find that user.
3. Change the `role` column from `user` to `admin`.
4. Log out and back in via `/admin/login`. You can now create additional admins via `/admin/register` or the API endpoint.

Alternative: insert directly with SQL in the dashboard (replace email and bcrypt hash):

```sql
insert into public.users (email, password_hash, name, role)
values ('you@example.com', '<bcrypt-hash>', 'Admin', 'admin');
```

Generate a bcrypt hash locally:

```bash
node -e "require('bcryptjs').hash('your-password', 10).then(console.log)"
```

---

## 6. Running the Development Server

```bash
npm run dev
```

This runs `next dev` with `FAST_REFRESH=false` (set via `cross-env` in [`package.json`](../package.json)). The page does a full reload on file changes instead of HMR — chosen for stability with the streaming AI routes.

Skip lint for faster iteration:

```bash
npm run dev:no-lint
```

Open `http://localhost:3000`. Expected first-run flow:

1. Land on `/`.
2. Sign up at `/signup` or log in at `/login`.
3. After login, the educational onboarding intro slides appear once (gated by the `intro_slides_done` cookie and the `learning_profiles.intro_slides_completed` column — see Troubleshooting below).
4. Reach `/dashboard`.

Different port:

```bash
npx next dev -p 3001
```

---

## 7. Running the Test Suites

### Unit / API tests (Jest)

```bash
npm run test:unit       # tests/api only
npm test                # full Jest run
npm run test:watch      # watch mode
npm run test:coverage   # coverage report (thresholds: 70% branches, 75% lines)
```

Jest config: [`jest.config.ts`](../jest.config.ts). Setup: [`tests/setup/jest.setup.ts`](../tests/setup/jest.setup.ts). The `node` test environment is used (the API routes need real `fetch`).

### End-to-end tests (Playwright)

```bash
npm run playwright:install         # one-time browser download
npm run test:e2e                   # all E2E tests
npm run test:e2e:user              # tests/e2e/user
npm run test:e2e:admin             # tests/e2e/admin
npm run test:e2e:admin:smoke       # tests/e2e/admin/admin-smoke.spec.ts (chromium only)
npm run test:e2e:ui                # interactive UI mode
npm run test:e2e:headed            # visible browser
```

Playwright auto-starts `npm run dev` if `BASE_URL` is unset; otherwise it points at the URL you provide ([`playwright.config.ts`](../playwright.config.ts) lines 91–98). HTML report is written to `tests/e2e-report/`.

### Combined / CI

```bash
npm run test:all   # unit + E2E
npm run test:ci    # jest --ci --coverage && playwright test
```

### Legacy/data-flow scripts

```bash
npm run test:api-legacy   # ts-node scripts/test-admin-user-api.ts
npm run test:dataflow     # ts-node scripts/test-api-endpoints.ts
```

These are ad-hoc smoke runners that hit a running server using credentials from `.env.local`.

---

## 8. Available npm Scripts

From [`package.json`](../package.json):

| Script | Command | Notes |
|--------|---------|-------|
| `dev` | `cross-env FAST_REFRESH=false next dev` | Default dev server. |
| `dev:no-lint` | `cross-env FAST_REFRESH=false next dev --no-lint` | Skip ESLint for speed. |
| `build` | `next build` | Production build. |
| `start` | `next start` | Serve the production build. |
| `lint` | `next lint` | ESLint via [`eslint.config.mjs`](../eslint.config.mjs). |
| `test` / `test:watch` / `test:coverage` | Jest variants | Coverage thresholds enforced. |
| `test:unit` | `jest tests/api` | API-route tests only. |
| `test:e2e` / `test:e2e:user` / `test:e2e:admin` / `test:e2e:admin:smoke` / `test:e2e:ui` / `test:e2e:headed` | Playwright variants | See Section 7. |
| `test:all` / `test:ci` | Combined runs | `test:ci` is what CI invokes. |
| `test:api-legacy` / `test:dataflow` | `ts-node` scripts | Manual smoke runners. |
| `playwright:install` | `playwright install` | Downloads browser binaries. |

---

## 9. Project Structure Overview

```
Media V3/
├── src/
│   ├── app/                          # Next.js 15 App Router
│   │   ├── api/                      # Backend routes (auth, admin, courses, AI, debug, …)
│   │   ├── admin/                    # Admin dashboard pages
│   │   ├── course/[courseId]/        # Course viewer with subtopic navigation
│   │   ├── request-course/           # Multi-step course creation (step1–3 + result)
│   │   ├── dashboard/                # User dashboard
│   │   └── login/, signup/           # Auth pages
│   ├── components/                   # Feature-organised React components + .module.scss
│   ├── services/                     # auth.service, course.service, ai.service
│   ├── hooks/                        # useAuth, useSessionStorage
│   ├── lib/                          # database, schemas, jwt, csrf, rate-limit, api-middleware, api-logger
│   ├── context/                      # RequestCourseContext (multi-step state)
│   └── types/                        # TypeScript types
├── tests/
│   ├── api/                          # Jest API integration tests
│   ├── unit/                         # Jest unit tests
│   ├── e2e/                          # Playwright .spec.ts tests
│   ├── fixtures/, setup/             # Shared helpers
├── docs/
│   ├── sql/                          # Legacy SQL reference (~31 files)
│   ├── ARCHITECTURE.md, DATABASE_SCHEMA.md, SECURITY.md, TESTING.md, …
├── supabase/
│   ├── config.toml                   # Supabase CLI config (Postgres 17)
│   └── migrations/                   # Canonical 60 timestamped migrations
├── scripts/                          # Standalone helpers (see below)
├── public/                           # Static assets
├── package.json, package-lock.json
├── next.config.ts, vercel.json
├── playwright.config.ts, jest.config.ts, tsconfig.json, tsconfig.test.json
├── eslint.config.mjs
└── .env.example, .gitignore
```

Helper scripts in [`scripts/`](../scripts/):

| Script | Purpose |
|--------|---------|
| `run-e2e-checklist.mjs` | End-to-end checklist runner that creates throwaway users via `adminDb` and exercises core routes. |
| `reflection-rollout-live.mjs` | Reflection-feature rollout helper that talks to a linked Supabase project; supports `--apply-safe` and `--json`. |
| `test-admin-user-api.ts` | Manual smoke for admin user APIs (`npm run test:api-legacy`). |
| `test-api-endpoints.ts` | Broader endpoint smoke (`npm run test:dataflow`). |

---

## 10. IDE Setup (VS Code, optional)

Recommended extensions:

- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **Playwright Test for VS Code** (`ms-playwright.playwright`)
- **SCSS IntelliSense** (`mrmlnc.vscode-scss`)

Suggested `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" },
  "typescript.preferences.importModuleSpecifier": "non-relative",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

If IntelliSense gets confused after pulling new code, run **TypeScript: Restart TS Server** from the command palette.

---

## 11. Path Aliases

Defined in [`tsconfig.json`](../tsconfig.json):

```json
"paths": { "@/*": ["./src/*"] }
```

Usage:

```ts
import { DatabaseService } from '@/lib/database';
import { useAuth } from '@/hooks/useAuth';
```

Jest mirrors the alias via `moduleNameMapper` ([`jest.config.ts`](../jest.config.ts) line 17–19).

---

## 12. Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| `Cannot find module '@/...'` | TS server out of date | **TypeScript: Restart TS Server** in VS Code. |
| `Missing env: NEXT_PUBLIC_SUPABASE_URL …` | `.env.local` missing/incomplete | Copy `.env.example` and fill all required vars (Section 3.2). |
| Login returns 401 / token errors | `JWT_SECRET` not set, or rotated since last login | Set `JWT_SECRET`. After rotation, all existing sessions are invalid — log in again. |
| Login returns 403 (CSRF) | Cookie not echoed back as `x-csrf-token` | Use `http://localhost:3000` (not `127.0.0.1`); ensure cookies are enabled. The frontend `apiFetch()` handles this automatically. |
| `bcrypt` install fails (native build) | Missing platform build tools | The runtime falls back to `bcryptjs` (pure JS). Either install build tools (`npm i -g node-gyp` plus your OS toolchain) or ignore the warning. |
| OpenAI 401/429 | Bad key or quota exhausted | Verify `OPENAI_API_KEY` and account credits. AI rate limit is 30 req/h per user. |
| AI request hits 60s timeout | Long generation | In dev, just retry. In production this is the Vercel `maxDuration`. |
| Stuck on educational intro slides every login | `intro_slides_done` cookie or `learning_profiles.intro_slides_completed` not set | Inspect the cookie in DevTools → Application; or update `learning_profiles.intro_slides_completed = true` for the user in Supabase. |
| Port 3000 in use | Old dev server still running | `npx kill-port 3000`, or `npx next dev -p 3001`. |
| `npm install` errors | Wrong Node version | Switch to Node 22.x (the `engines.node` constraint will warn). |
| `/api/test-db` returns 500 | Wrong Supabase keys, or schema not applied | Re-check keys; rerun `supabase db push`. |
| `/api/debug/*` returns 404 in dev | Caller is not an admin | Debug routes require an admin role even in dev (see [`src/app/api/debug/users/route.ts`](../src/app/api/debug/users/route.ts) lines 14–26). |

### Reset local state

```bash
rm -rf node_modules .next
npm install
npm run dev
```

---

## 13. Next Steps

| Document | Purpose |
|----------|---------|
| [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, auth flow, AI pipeline. |
| [docs/DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Full schema reference (tables, views, RLS). |
| [docs/API_REFERENCE.md](./API_REFERENCE.md) | Endpoint inventory with request/response shapes. |
| [docs/SECURITY.md](./SECURITY.md) | CSRF, JWT, rate limiting, RLS guarantees. |
| [docs/TESTING.md](./TESTING.md) | Jest + Playwright conventions, fixtures, CI matrix. |
| [docs/DEPLOYMENT.md](./DEPLOYMENT.md) | Production deployment to Vercel + Supabase. |
| [CLAUDE.md](../CLAUDE.md) | Codebase conventions used by the AI dev assistant. |

Quick happy path once everything is running:

1. `npm run dev`
2. Sign up at `http://localhost:3000/signup`
3. Promote yourself to admin in Supabase (Section 5)
4. Create a course at `/request-course/step1`
5. Explore quizzes, examples, and AI Q&A inside the generated course
6. Visit `/admin/dashboard` to see metrics and `api_logs` populating
