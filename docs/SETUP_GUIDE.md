# PrincipleLearn V3 - Setup & Installation Guide

> **Framework:** Next.js 15 with App Router  
> **Language:** TypeScript, React 19, Sass Modules  
> **Database:** Supabase PostgreSQL with RLS  
> **AI Integration:** OpenAI API  
> **Last Updated:** 2026-04-08

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Clone & Install](#2-clone--install)
3. [Environment Configuration](#3-environment-configuration)
4. [Supabase Database Setup](#4-supabase-database-setup)
5. [Running the Development Server](#5-running-the-development-server)
6. [Available Scripts](#6-available-scripts)
7. [Project Structure Overview](#7-project-structure-overview)
8. [IDE Setup (VS Code)](#8-ide-setup-vs-code)
9. [Troubleshooting](#9-troubleshooting)
10. [Next Steps](#10-next-steps)

---

## 1. Prerequisites

Before you begin, make sure you have the following installed and available on your machine:

| Requirement | Minimum Version | Notes |
|-------------|-----------------|-------|
| **Node.js** | 18+ (LTS recommended) | Download from [nodejs.org](https://nodejs.org/) |
| **npm** | 9+ | Comes bundled with Node.js |
| **Git** | 2.30+ | Download from [git-scm.com](https://git-scm.com/) |
| **Supabase account** | Free tier works | Sign up at [supabase.com](https://supabase.com/) |
| **OpenAI API key** | -- | Required for AI features (course generation, Q&A, challenge thinking) |
| **Code editor** | -- | VS Code is recommended |

Verify your installations:

```bash
node --version    # Should print v18.x.x or higher
npm --version     # Should print 9.x.x or higher
git --version     # Should print 2.30+ or higher
```

---

## 2. Clone & Install

### 2.1 Clone the Repository

```bash
git clone <repository-url>
cd "Media V3"
```

### 2.2 Install Dependencies

```bash
npm install
```

This installs all production and development dependencies defined in `package.json`, including:

- **Next.js 15** and **React 19** (framework and UI)
- **@supabase/supabase-js** (database client)
- **openai** (AI integration)
- **zod** (request validation)
- **bcryptjs** / **bcrypt** (password hashing)
- **jsonwebtoken** (JWT authentication)
- **sass** (SCSS module styling)
- **cross-env** (cross-platform environment variable support)
- **jest** and **@playwright/test** (testing)

### 2.3 Install Playwright Browsers (for E2E tests)

If you plan to run end-to-end tests, install the required browser binaries:

```bash
npm run playwright:install
```

> **Note:** The project uses `cross-env` to set environment variables in npm scripts, ensuring commands work identically on Windows, macOS, and Linux. Fast Refresh is disabled by default (`cross-env FAST_REFRESH=false`) for stability; hot reload still works via full page refresh.

---

## 3. Environment Configuration

### 3.1 Create Your Environment File

Copy the example environment file to create your local configuration:

```bash
cp .env.example .env.local
```

On Windows (Command Prompt):

```cmd
copy .env.example .env.local
```

### 3.2 Required Environment Variables

Open `.env.local` in your editor and fill in each value:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL | `https://abc123xyz.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous (public) key | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (elevated access) | `eyJhbGciOiJIUzI1NiIs...` |
| `JWT_SECRET` | Secret for signing JWTs (minimum 32 characters) | `a-strong-random-string-at-least-32-chars` |
| `OPENAI_API_KEY` | Your OpenAI API key | `sk-proj-...` |
| `OPENAI_MODEL` | OpenAI model to use (optional, defaults to `gpt-5-mini`) | `gpt-5-mini` |
| `NEXT_PUBLIC_APP_URL` | Application base URL | `http://localhost:3000` |

### 3.3 Example `.env.local`

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# JWT Configuration
JWT_SECRET=your-jwt-secret-key-here-change-this-in-production

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key-here
OPENAI_MODEL=gpt-5-mini

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3.4 Security Warnings

> **WARNING: NEVER commit `.env.local` to Git.** It is listed in `.gitignore` by default (the pattern `.env*` excludes all env files).

> **WARNING: `JWT_SECRET` must be a strong, cryptographically random string in production.** A weak secret compromises all user authentication tokens.

> **WARNING: `SUPABASE_SERVICE_ROLE_KEY` has full database access and bypasses all Row-Level Security policies.** Never expose this key in client-side code or public repositories.

---

## 4. Supabase Database Setup

### 4.1 Create a Supabase Project

1. Go to [supabase.com](https://supabase.com/) and sign in (or create a free account).
2. Click **New Project** and fill in the project details (name, database password, region).
3. Wait for the project to finish provisioning.
4. Navigate to **Settings > API** and copy:
   - **Project URL** --> `NEXT_PUBLIC_SUPABASE_URL`
   - **anon (public) key** --> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** --> `SUPABASE_SERVICE_ROLE_KEY`

### 4.2 Database Schema

The database consists of **26 tables**, **3 views**, and **4 functions**. SQL migration files are located in the `docs/sql/` directory.

Run the following SQL files in order via the Supabase SQL Editor (**Dashboard > SQL Editor > New Query**):

#### Step 1: Create Core Tables

Create all 26 tables. The core tables include:

- `users` - User accounts with roles
- `courses` - Generated learning courses
- `subtopics` - Course content subdivisions
- `quiz` - Quiz questions per subtopic
- `quiz_submissions` - Student quiz answers
- `jurnal` - Learning journal entries
- `transcript` - Course transcript/notes
- `user_progress` - Learning progress tracking
- `feedback` - User feedback
- `discussion_sessions` - AI discussion sessions
- `discussion_messages` - Individual discussion messages
- `ask_question_history` - Q&A interaction logs
- `challenge_responses` - Critical thinking challenge submissions
- `api_logs` - API request logging
- `learning_sessions` - Session tracking
- Research tables (prompt classifications, cognitive indicators, etc.)

#### Step 2: Add RLS Policies

```
docs/sql/add_rls_policies_all_tables.sql
```

This adds Row-Level Security policies to all tables, controlling data access at the database level.

#### Step 3: Create Database Functions

Run these function creation scripts:

```
docs/sql/create_get_jsonb_columns_function.sql
docs/sql/create_get_admin_user_stats_function.sql
```

These create:
- `get_jsonb_columns()` - Auto-detects JSONB columns from the schema
- `get_admin_user_stats()` - Aggregates user statistics for admin dashboard
- `update_session_metrics()` - Updates learning session metrics
- `calculate_stage_transition()` - Calculates learning stage transitions

#### Step 4: Create Views

The application uses three database views for research analytics:

- `v_longitudinal_prompt_development` - Tracks prompt quality over time
- `v_prompt_classification_summary` - Aggregates prompt classification data
- `v_cognitive_indicators_summary` - Summarizes cognitive indicator scores

#### Step 5: Run Additional Migrations

Run the remaining migration files as needed:

```
docs/sql/create_transcript_table.sql
docs/sql/create_rate_limits_table.sql
docs/sql/create_research_tables.sql
docs/sql/create_discussion_admin_actions.sql
docs/sql/alter_learning_sessions_add_fields.sql
docs/sql/add_quiz_submission_context_columns.sql
```

> **Tip:** For a complete reference of every table, column, relationship, and RLS policy, see [docs/DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md).

### 4.3 Create an Admin User

The application has two user roles: **user** (regular student) and **admin**. To create your first admin:

**Option A: Register via the app, then promote**
1. Start the development server (see Section 5).
2. Navigate to the signup page and register a new account.
3. Open the Supabase Dashboard, go to **Table Editor > users**.
4. Find your newly created user and change the `role` column from `user` to `admin`.

**Option B: Use the admin registration endpoint**
After you have at least one admin user, additional admins can be registered through the `/admin/register` page or the `/api/admin/register` API endpoint.

### 4.4 Verify Database Connection

After configuring the database, you can verify the connection by:

1. Starting the development server.
2. Navigating to `/api/test-db` in your browser.
3. A successful response confirms the database connection is working.

---

## 5. Running the Development Server

### 5.1 Start the Server

```bash
npm run dev
```

This runs the Next.js development server with ESLint enabled and Fast Refresh disabled.

For a faster startup without linting:

```bash
npm run dev:no-lint
```

### 5.2 Access the Application

Once the server starts, open your browser and navigate to:

```
http://localhost:3000
```

### 5.3 Development Notes

- **Fast Refresh is disabled** (`cross-env FAST_REFRESH=false`) for build stability. The page will fully reload on file changes instead of performing hot module replacement.
- **ESLint** runs automatically during development with `npm run dev`. Use `npm run dev:no-lint` to skip this for faster iteration.
- If port 3000 is already in use, you can specify a different port:

```bash
npx next dev -p 3001
```

---

## 6. Available Scripts

All scripts are defined in `package.json` and run via `npm run <script>`:

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start development server with ESLint |
| `dev:no-lint` | `npm run dev:no-lint` | Start development server without ESLint (faster) |
| `build` | `npm run build` | Create an optimized production build |
| `start` | `npm run start` | Start the production server (run `build` first) |
| `lint` | `npm run lint` | Run ESLint on the codebase |
| `test` | `npm test` | Run Jest unit and integration tests |
| `test:watch` | `npm run test:watch` | Run Jest in watch mode (re-runs on file changes) |
| `test:coverage` | `npm run test:coverage` | Run Jest with code coverage report |
| `test:unit` | `npm run test:unit` | Run API-level tests only (`tests/api`) |
| `test:e2e` | `npm run test:e2e` | Run Playwright end-to-end tests (Chromium) |
| `test:e2e:user` | `npm run test:e2e:user` | Run user-flow E2E tests only |
| `test:e2e:admin` | `npm run test:e2e:admin` | Run admin-flow E2E tests only |
| `test:e2e:ui` | `npm run test:e2e:ui` | Open Playwright UI mode for interactive test debugging |
| `test:e2e:headed` | `npm run test:e2e:headed` | Run E2E tests in headed browser mode (visible) |
| `test:all` | `npm run test:all` | Run both unit tests and E2E tests sequentially |
| `test:ci` | `npm run test:ci` | CI pipeline: Jest with coverage + Playwright |
| `playwright:install` | `npm run playwright:install` | Install Playwright browser binaries |

### Testing Notes

- **Jest** is used for unit and API integration tests. Test files live in `tests/api` and `tests/unit`.
- **Playwright** is used for end-to-end browser tests. Test files live in `tests/e2e` and use the `.spec.ts` extension.
- E2E tests are configured to run against Chromium by default (see `playwright.config.ts`).
- The Playwright config automatically starts the dev server before running tests (`webServer` option).
- On CI, tests run with a single worker and 2 retries for stability.

---

## 7. Project Structure Overview

```
Media V3/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── api/               # Backend API routes
│   │   │   ├── auth/          # User authentication (login, logout, refresh, me)
│   │   │   ├── admin/         # Admin operations (users, dashboard, activity)
│   │   │   ├── courses/       # Course CRUD
│   │   │   ├── generate-*/    # AI generation endpoints
│   │   │   ├── ask-question/  # AI Q&A (streaming)
│   │   │   ├── challenge-*/   # Critical thinking challenges
│   │   │   └── debug/         # Development utilities
│   │   ├── admin/             # Admin dashboard pages
│   │   ├── course/[courseId]/ # Dynamic course viewing with subtopic navigation
│   │   ├── request-course/    # Multi-step course creation (step1, step2, step3, result)
│   │   ├── dashboard/         # User dashboard
│   │   └── login/, signup/    # Authentication pages
│   ├── components/            # Feature-organized React components
│   │   ├── admin/             # Admin-specific components
│   │   ├── Quiz/              # Quiz system
│   │   ├── Examples/          # Example generation and display
│   │   ├── ChallengeThinking/ # Challenge feedback system
│   │   ├── AskQuestion/       # Q&A components
│   │   └── .../               # Other feature components
│   ├── services/              # Business logic layer
│   │   ├── auth.service.ts    # User lookup, password hashing, JWT, CSRF
│   │   ├── course.service.ts  # Course CRUD, subtopic management, access control
│   │   └── ai.service.ts      # OpenAI calls (single, retry, streaming)
│   ├── hooks/                 # Custom React hooks
│   │   ├── useAuth.tsx        # Authentication state management
│   │   └── useSessionStorage.ts
│   ├── lib/                   # Core infrastructure
│   │   ├── database.ts        # DatabaseService, adminDb, publicDb (Supabase)
│   │   ├── schemas.ts         # 14 Zod validation schemas + parseBody()
│   │   ├── api-client.ts      # Frontend apiFetch() with CSRF + 401 retry
│   │   ├── jwt.ts             # JWT sign/verify utilities
│   │   ├── csrf.ts            # CSRF double-submit cookie protection
│   │   ├── rate-limit.ts      # In-memory rate limiter
│   │   ├── api-middleware.ts   # withProtection(), withCacheHeaders()
│   │   └── api-logger.ts      # withApiLogging() for api_logs table
│   ├── context/               # React Context providers
│   │   └── RequestCourseContext.tsx
│   └── types/                 # TypeScript type definitions
├── tests/                     # Test suites
│   ├── api/                   # Jest API integration tests
│   ├── unit/                  # Jest unit tests
│   ├── e2e/                   # Playwright end-to-end tests
│   ├── fixtures/              # Test data fixtures
│   └── setup/                 # Test environment setup
├── docs/                      # Documentation
│   └── sql/                   # SQL migration files
├── public/                    # Static assets
├── package.json               # Dependencies and scripts
├── tsconfig.json              # TypeScript configuration
├── playwright.config.ts       # Playwright E2E test config
├── next.config.ts             # Next.js configuration
├── .env.example               # Environment variable template
└── .gitignore                 # Git ignore rules
```

---

## 8. IDE Setup (VS Code)

### 8.1 Recommended Extensions

Install the following VS Code extensions for the best development experience:

| Extension | Purpose |
|-----------|---------|
| **ESLint** (`dbaeumer.vscode-eslint`) | JavaScript/TypeScript linting |
| **TypeScript and JavaScript Language Features** | Built-in TypeScript support |
| **SCSS IntelliSense** (`mrmlnc.vscode-scss`) | Autocompletion for `.module.scss` files |
| **Playwright Test for VS Code** (`ms-playwright.playwright`) | Run and debug E2E tests from the editor |
| **Sass** (`syler.sass-indented`) | Sass/SCSS syntax highlighting |

### 8.2 Path Alias Configuration

The project uses `@/` as a path alias that maps to the `src/` directory. This is configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

This means you can import like this:

```typescript
import { DatabaseService } from '@/lib/database';
import { useAuth } from '@/hooks/useAuth';
```

VS Code should resolve these automatically. If IntelliSense stops recognizing the aliases, restart the TypeScript server: press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) and select **TypeScript: Restart TS Server**.

### 8.3 Recommended Settings

Add these to your `.vscode/settings.json` for a smoother experience:

```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "non-relative"
}
```

---

## 9. Troubleshooting

### Common Issues and Solutions

| Problem | Cause | Solution |
|---------|-------|----------|
| **"Missing environment variables"** error on startup | `.env.local` is missing or incomplete | Ensure `.env.local` exists and contains all required variables (see Section 3) |
| **Cannot connect to Supabase** | Incorrect URL or keys | Double-check `NEXT_PUBLIC_SUPABASE_URL` and keys in your Supabase dashboard under **Settings > API** |
| **"JWT_SECRET not set"** error | Missing or empty `JWT_SECRET` | Add a strong random string (minimum 32 characters) to `.env.local` |
| **OpenAI rate limit errors** | Invalid key or quota exceeded | Verify `OPENAI_API_KEY` is valid and your OpenAI account has available credits |
| **"Module not found: @/..."** | TypeScript server out of sync | Restart the TS server: `Ctrl+Shift+P` > **TypeScript: Restart TS Server** |
| **Port 3000 already in use** | Another process is using the port | Kill the existing process, or start on a different port: `npx next dev -p 3001` |
| **E2E tests fail immediately** | Playwright browsers not installed | Run `npm run playwright:install` to download browser binaries |
| **`npm install` fails with native module errors** | Missing build tools for `bcrypt` | Install build tools (`npm install -g node-gyp`) or the project will fall back to `bcryptjs` (pure JS) |
| **CSRF token errors (403)** | Cookies not being sent | Ensure you are accessing the app via `http://localhost:3000` (not `127.0.0.1`), and that cookies are enabled |
| **"Access denied" on admin pages** | User role is not `admin` | Update the user's `role` to `admin` in the Supabase `users` table (see Section 4.3) |
| **Build fails with type errors** | TypeScript strict mode catching issues | Run `npm run lint` first to see all errors, then fix them before building |

### Checking Database Connectivity

Navigate to `/api/test-db` in your browser while the dev server is running. A JSON response confirming the connection means your Supabase setup is correct.

### Checking Authentication Flow

1. Register a new user at `/signup`.
2. Log in at `/login`.
3. If login succeeds, you should be redirected to `/dashboard`.
4. If you get token errors, verify that `JWT_SECRET` is set correctly in `.env.local`.

### Resetting Local State

If you encounter persistent issues:

```bash
# Remove node_modules and reinstall
rm -rf node_modules
npm install

# Clear Next.js cache
rm -rf .next

# Restart the dev server
npm run dev
```

---

## 10. Next Steps

Once your development environment is running, explore these resources to understand the system in depth:

| Document | Path | Description |
|----------|------|-------------|
| **Architecture Guide** | [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, authentication flow, and design decisions |
| **API Reference** | [docs/API_REFERENCE.md](./API_REFERENCE.md) | Complete API endpoint documentation with request/response examples |
| **Database Schema** | [docs/DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Full schema reference: 26 tables, views, functions, RLS policies |
| **Project Instructions** | [CLAUDE.md](../CLAUDE.md) | Developer reference for codebase conventions and patterns |

### Quick Start Workflow

1. Start the dev server: `npm run dev`
2. Register a user account at `http://localhost:3000/signup`
3. Create your first course at `http://localhost:3000/request-course/step1`
4. Explore the generated course content with quizzes, examples, and AI-powered Q&A
5. To access admin features, promote your user to admin (see Section 4.3), then visit `http://localhost:3000/admin`
