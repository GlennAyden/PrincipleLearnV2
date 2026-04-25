# PrincipleLearn V3 — Deployment Guide

Audience: operators deploying to production.
Goal: ship the app to Vercel against a production Supabase project, and keep it healthy afterwards.

> Stack: Next.js 15 on Vercel · Supabase Postgres 17 · OpenAI API
> Last verified against: [`package.json`](../package.json), [`.env.example`](../.env.example), [`vercel.json`](../vercel.json), [`supabase/config.toml`](../supabase/config.toml), [`middleware.ts`](../middleware.ts)

---

## Table of Contents

1. [Production Prerequisites](#1-production-prerequisites)
2. [Pre-Deployment Checklist](#2-pre-deployment-checklist)
3. [Vercel Project Setup](#3-vercel-project-setup)
4. [Environment Variables in Vercel](#4-environment-variables-in-vercel)
5. [`vercel.json` Explained](#5-verceljson-explained)
6. [Supabase Production Setup](#6-supabase-production-setup)
7. [Domain & SSL](#7-domain--ssl)
8. [Post-Deploy Verification](#8-post-deploy-verification)
9. [Rollback Strategy](#9-rollback-strategy)
10. [Monitoring & Operations](#10-monitoring--operations)
11. [Operational Runbooks](#11-operational-runbooks)
12. [Production Security Checklist](#12-production-security-checklist)
13. [Scaling Notes](#13-scaling-notes)
14. [Cross-References](#14-cross-references)

---

## 1. Production Prerequisites

| Requirement | Notes |
|-------------|-------|
| Vercel account | Hobby works for low traffic; Pro needed for `maxDuration` > 60s and PITR-equivalent observability. |
| Production Supabase project | **Separate** from dev/staging. Use a Pro project if you need PITR, larger storage, and daily backups. |
| OpenAI account with billing | Set a monthly hard limit in the OpenAI dashboard. The default model is `gpt-5-mini`. |
| GitHub repo connected to Vercel | The `main` branch is the production trunk; other branches deploy as Previews. |
| Custom domain (optional) | DNS records configured for Vercel. |
| `openssl` (or equivalent) | To generate a strong `JWT_SECRET`. |

The application is a pure Next.js 15 App Router project — there is no Docker image, no container orchestration, and no separate worker process. Vercel serverless functions handle all routes including AI streaming.

---

## 2. Pre-Deployment Checklist

Before promoting to production, verify every item:

- [ ] All env vars set in Vercel (Section 4) and scoped correctly (Production / Preview).
- [ ] `JWT_SECRET` generated with `openssl rand -hex 64` — **not** the dev value.
- [ ] Supabase production project provisioned, all migrations from [`supabase/migrations/`](../supabase/migrations/) applied, RLS visible on every public table.
- [ ] At least one admin user exists in `users` with `role = 'admin'` (see [docs/SETUP_GUIDE.md §5](./SETUP_GUIDE.md#5-first-admin-user)).
- [ ] OpenAI key valid; account has credits and a monthly cap set.
- [ ] `npm run build` succeeds locally against production env vars.
- [ ] `npm run test:ci` passes.
- [ ] Debug routes are gated. By default they refuse in production unless `ENABLE_DEBUG_ROUTES=1` is set; even then the caller must be admin (see [`src/app/api/debug/users/route.ts`](../src/app/api/debug/users/route.ts) lines 14–26). Leave the env var unset in production.
- [ ] `NEXT_PUBLIC_APP_URL` matches the final production domain (controls cookie/CORS behavior).
- [ ] `ENABLE_PRODUCTION_ACTIVITY_SEED` is `false` (or unset). Only set `true` for non-research demo deploys.

---

## 3. Vercel Project Setup

1. Go to [vercel.com](https://vercel.com) → **New Project** → import the GitHub repository.
2. Vercel auto-detects Next.js. Confirm:
   - **Framework Preset**: Next.js
   - **Build Command**: `next build` (matches `npm run build` in [`package.json`](../package.json))
   - **Install Command**: `npm install`
   - **Output Directory**: `.next` (auto)
3. **Node.js Version**: set to **22.x** in **Project Settings → General → Node.js Version**. The repo pins `engines.node = "22.x"` in [`package.json`](../package.json) — Vercel will warn if the runtime drifts.
4. Branch settings:
   - **Production Branch**: `main`
   - All other branches deploy as Previews automatically.

### Manual deploys via the CLI

```bash
npm i -g vercel
vercel login
vercel           # preview
vercel --prod    # production
```

---

## 4. Environment Variables in Vercel

Set these under **Project Settings → Environment Variables**. Match the names in [`.env.example`](../.env.example).

| Variable | Production | Preview | Development | Sensitive | Notes |
|----------|:----------:|:-------:|:-----------:|:---------:|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes (dev/staging project) | yes | no | Exposed to the browser. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes (dev/staging project) | yes | no | Exposed to the browser; respects RLS. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **no — use the dev/staging service key only** | local only | **yes** | Bypasses RLS. Never put the prod key in Preview. |
| `JWT_SECRET` | yes | dev/staging value, not prod | local only | **yes** | Generate with `openssl rand -hex 64`. Use a different value per environment. |
| `OPENAI_API_KEY` | yes | optional (consumes credits) | local only | **yes** | Set a monthly cap in the OpenAI dashboard. |
| `OPENAI_MODEL` | yes | yes | yes | no | Defaults to `gpt-5-mini`. |
| `NEXT_PUBLIC_APP_URL` | yes (final domain) | per-deploy URL or wildcard | `http://localhost:3000` | no | Must match the actual served origin or CORS/cookie behavior breaks. |
| `ENABLE_PRODUCTION_ACTIVITY_SEED` | `false` | `false` | n/a | no | Only `true` for intentional demo seeding. |
| `ENABLE_DEBUG_ROUTES` | leave unset | leave unset | n/a | no | If set to `1`, `/api/debug/*` is reachable in prod, but only by admin callers. Leave unset. |

### Generating a strong JWT secret

```bash
openssl rand -hex 64
```

Rotate `JWT_SECRET` only intentionally — rotation invalidates every active access and refresh token, so all users will be forced to log in again.

---

## 5. `vercel.json` Explained

[`vercel.json`](../vercel.json) at the repo root:

```json
{
  "regions": ["sin1"],
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

| Field | Value | Why |
|-------|-------|-----|
| `regions` | `["sin1"]` (Singapore) | Lowest latency for Southeast Asia traffic, which matches the project's primary audience. Change if your users live elsewhere. |
| `functions["src/app/api/**/*.ts"].maxDuration` | `60` seconds | Required for OpenAI streaming. Vercel's default 10s timeout cannot fit course generation, `ask-question`, or `challenge-thinking`. **Hobby plan caps at 60s; Pro can go up to 300s.** |

If you ever upgrade to Vercel Pro and want longer course generations, raise `maxDuration` here (and re-deploy). Do not raise it without first checking OpenAI typical latency in your prompt set.

There are currently no `headers`, `rewrites`, or `redirects` in `vercel.json` — [`middleware.ts`](../middleware.ts) handles auth, role gating, and header injection.

---

## 6. Supabase Production Setup

### 6.1 Provision

1. Create a **separate** Supabase project for production. Never share a database with development.
2. Pick the closest region to `sin1` if you can (e.g. Singapore) to minimize cross-region latency for serverless function calls.
3. Under **Settings → Database → Backups**, confirm daily backups are enabled (Pro+ adds Point-in-Time Recovery).
4. Copy URL, anon key, and service-role key into Vercel env vars (Section 4).

### 6.2 Apply migrations

Use the Supabase CLI against the linked production project:

```bash
npx supabase login
npx supabase link --project-ref <prod-project-ref>
npx supabase db push
```

This applies every file in [`supabase/migrations/`](../supabase/migrations/) in order. As of writing: 60 timestamped migrations, including the baseline tables, RLS phase D, security hardening phases A–D, leaf-subtopic RPCs, refresh-token hashing, and the research/coder pipeline (`thesis_stage2…stage4`, `auto_cognitive_scores`).

If you cannot use the CLI, paste each file from `supabase/migrations/` into the Supabase **SQL Editor** in lexical order. Skip nothing.

The legacy [`docs/sql/`](sql/) directory is reference-only — do not apply files from it unless an internal doc explicitly tells you to (e.g. for a one-off backfill).

### 6.3 Verify RLS

Open **Table Editor** in the Supabase dashboard. Every table in `public` should show "RLS enabled". Service-role queries bypass RLS by design (used by `adminDb`); anon queries via `publicDb` must respect RLS. The Supabase **Database → Advisors → Security** report should be clean.

### 6.4 Connection model

The app talks to Supabase only via the PostgREST/JS client — no direct PostgreSQL connections. Two clients exist (defined in [`src/lib/database.ts`](../src/lib/database.ts)):

- `adminDb` — service role, bypasses RLS, used by all server routes.
- `publicDb` — anon key, respects RLS, used for public reads.

You do not need to configure PgBouncer or worry about connection pool size from the app side.

### 6.5 Network restrictions (optional)

Supabase Pro supports IP allowlists under **Settings → Database → Network restrictions**. Vercel's serverless functions use a wide IP range, so allowlisting is impractical for the app — leave it open. You can restrict it for a separate analyst tool that only you use.

---

## 7. Domain & SSL

1. **Project Settings → Domains** in Vercel → **Add** your domain (`learn.example.com`).
2. Add the CNAME (or A) record at your DNS provider as instructed.
3. Wait for SSL provisioning (usually under 5 minutes).
4. **Update `NEXT_PUBLIC_APP_URL`** in Vercel to the final HTTPS URL and redeploy. Cookies use `secure: true` automatically when `NODE_ENV=production`, and CORS is derived from `NEXT_PUBLIC_APP_URL`.

---

## 8. Post-Deploy Verification

Run through this every time you deploy a release:

1. Open the production URL — landing page loads, no console errors.
2. `/signup` — create a throwaway test account; confirm it appears in `public.users`.
3. `/login` — log in with the test account. In DevTools → Application → Cookies, verify `access_token`, `refresh_token`, and `csrf_token` cookies are set with `Secure` and `HttpOnly` (the first two) flags.
4. `/dashboard` — loads.
5. `/request-course/step1` → step3 → result — full course generation completes (this round-trips OpenAI; expect 20–60s).
6. Inside the generated course, trigger an AI Q&A and a challenge — the streaming endpoints respond.
7. `/admin/login` — log in as your admin user.
8. `/admin/dashboard` — metrics render and `api_logs` shows recent requests.
9. `GET /api/auth/me` returns the authenticated user.
10. Vercel **Deployments → Functions → Logs** shows no recurring 5xx errors.
11. Delete the throwaway test account (or rely on soft-delete via `deleted_at`).

---

## 9. Rollback Strategy

### Application (Vercel)

1. **Deployments** in the Vercel dashboard.
2. Find the last known-good deployment.
3. Click the three-dot menu → **Promote to Production**.

This swaps traffic instantly with zero downtime. Database schema is **not** rolled back.

### Database (Supabase)

- **Never** auto-rollback DDL. Rolling back a column drop or RLS change usually means restoring from backup.
- **Free tier**: keep your own SQL backups (`pg_dump` via the connection string).
- **Pro tier**: use Point-in-Time Recovery to restore to any timestamp inside the retention window.
- For data-only mistakes (bad updates, accidental deletes) prefer a targeted SQL fix over a full restore.

### Code (Git)

```bash
git revert <bad-commit-sha>
git push origin main
```

Avoid `git reset --hard` on `main` — it loses history and confuses Vercel's deployment graph. Force-push to `main` is also a no-go.

---

## 10. Monitoring & Operations

### 10.1 Vercel

- **Deployments → Functions → Logs**: real-time function logs.
- **Project Settings → Analytics**: enable Web Vitals (free).
- **Project Settings → Alerts**: hook a Slack/email destination for failed deploys.

### 10.2 Supabase

- **Reports**: query performance, storage, connection counts.
- **Logs Explorer**: filter by `auth`, `database`, `api`.
- **Advisors**: re-check **Security** and **Performance** tabs after every migration.

### 10.3 In-app logs and dashboards

- `api_logs` table — every API request is logged via `withApiLogging()` ([`src/lib/api-logger.ts`](../src/lib/api-logger.ts)) with route, method, status, duration, user id, and error text. Query it directly in Supabase or use:
  - `/admin/dashboard` — overview metrics.
  - `/api/admin/monitoring/logging` — JSON feed of recent log entries.
- `rate_limits` table — persisted rate-limit hits. Useful for spotting abuse.
- `feedback` table — user feedback inbox.

### 10.4 OpenAI

- [platform.openai.com/usage](https://platform.openai.com/usage) — token usage and spend.
- Set a **hard monthly limit** so a runaway prompt doesn't burn the budget.
- The per-user AI rate limit (30 req/h, enforced in [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts)) is the second line of defense.

---

## 11. Operational Runbooks

All SQL below assumes you are connected to the production database with a service-role token (Supabase **SQL Editor**) — `adminDb` from the app uses the same key.

### Reset a user password manually

```sql
-- Generate the bcrypt hash locally first:
--   node -e "require('bcryptjs').hash('NewPassword123!', 10).then(console.log)"
update public.users
set password_hash = '<bcrypt-hash>'
where email = 'user@example.com';
```

### Disable a user (soft delete)

The schema uses soft deletes via `deleted_at`. Do not hard-delete admin or `sal@expandly.id`.

```sql
update public.users
set deleted_at = now()
where email = 'user@example.com'
  and role <> 'admin';
```

### Re-enable a soft-deleted user

```sql
update public.users
set deleted_at = null
where email = 'user@example.com';
```

### Promote a user to admin

```sql
update public.users
set role = 'admin'
where email = 'user@example.com';
```

### Clear expired rate limits

```sql
delete from public.rate_limits
where expires_at < now();
```

### Investigate a failing route

```sql
select created_at, status_code, duration_ms, user_id, error_message
from public.api_logs
where route = '/api/generate-course'
  and status_code >= 500
order by created_at desc
limit 50;
```

### Top noisy users (last 24h)

```sql
select user_id, count(*) as hits
from public.api_logs
where created_at > now() - interval '24 hours'
group by user_id
order by hits desc
limit 20;
```

### Database size and largest tables

```sql
select relname,
       pg_size_pretty(pg_total_relation_size(relid)) as total
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc
limit 15;
```

### Force a refresh-token rotation for a user

Token rotation happens automatically on each refresh, but if you suspect a refresh token was stolen:

```sql
update public.users
set refresh_token_hash = null
where email = 'user@example.com';
```

The user is forced to log in again on the next request.

---

## 12. Production Security Checklist

- [ ] HTTPS enforced (automatic on Vercel; do not disable).
- [ ] `JWT_SECRET` is 64+ random hex chars, set in Production scope only, **different** from dev.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in Production scope only.
- [ ] `ENABLE_DEBUG_ROUTES` unset (leaves `/api/debug/*` returning 404 in prod).
- [ ] All public tables have RLS enabled.
- [ ] Supabase **Advisors → Security** report has no critical findings.
- [ ] OpenAI account has a monthly hard cap.
- [ ] CORS / cookies match the live domain (`NEXT_PUBLIC_APP_URL` set correctly).
- [ ] CSRF double-submit cookie pattern is intact: `csrf_token` is non-`HttpOnly`, `access_token` and `refresh_token` are `HttpOnly` + `Secure` + `SameSite=lax`.
- [ ] Rate limits active on `/api/auth/login`, `/api/admin/login`, register, password reset, and AI endpoints.
- [ ] First admin user exists; subsequent admins created via `/api/admin/register` (which itself requires admin auth).
- [ ] Deployment branch protections on GitHub (require PR review for `main`).

---

## 13. Scaling Notes

### Vercel

- Functions auto-scale; cold starts add ~200–500ms. There is no shared in-memory state between invocations — anything that must persist across requests (rate limits, sessions) lives in Postgres.
- If course generation regularly exceeds 60s, upgrade to Pro and raise `maxDuration` in [`vercel.json`](../vercel.json).

### Supabase

- Free tier (500MB, low connection cap) is fine for a handful of users. Move to Pro before any real traffic — you also get PITR.
- The `subtopic_cache` table reduces redundant AI calls for shared content.
- Indexes were added by the `harden_*` and `fase_d_rls_perf_and_indexes` migrations. Re-run **Advisors → Performance** after schema changes.

### OpenAI

- `gpt-5-mini` is the cost/quality sweet spot for this app.
- Course generation is the heaviest call by far; everything else is short.
- Streaming (`ask-question`, `challenge-thinking`) reduces perceived latency without changing token cost.

---

## 14. Cross-References

| Document | Purpose |
|----------|---------|
| [docs/SETUP_GUIDE.md](./SETUP_GUIDE.md) | Local development onboarding. |
| [docs/ARCHITECTURE.md](./ARCHITECTURE.md) | System architecture, request lifecycle. |
| [docs/SECURITY.md](./SECURITY.md) | Auth, CSRF, RLS, rate limiting in depth. |
| [docs/DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) | Schema reference. |
| [docs/TESTING.md](./TESTING.md) | Test suites used in `npm run test:ci`. |
| [CLAUDE.md](../CLAUDE.md) | Codebase conventions. |
