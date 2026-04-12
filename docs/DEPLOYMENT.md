# PrincipleLearn V3 - Deployment Guide

## 1. Overview

PrincipleLearn V3 is a Next.js 15 application with the following production infrastructure:

- **Hosting**: Vercel (recommended, serverless)
- **Database**: Supabase (managed PostgreSQL with PostgREST API)
- **AI Provider**: OpenAI API (course generation, Q&A, challenge thinking)
- **Authentication**: Custom JWT-based auth with CSRF double-submit cookie pattern

There is no Docker or container support. The application is designed for Vercel's serverless deployment model.

---

## 2. Pre-Deployment Checklist

Complete every item before deploying to production:

- [ ] All environment variables configured (see Section 3.2)
- [ ] `JWT_SECRET` is a strong random string (minimum 64 characters, not the default placeholder)
- [ ] Database schema is up to date (all tables, RLS policies, functions, and views applied)
- [ ] At least one admin user created in the `users` table with `role = 'ADMIN'`
- [ ] OpenAI API key is valid and the account has sufficient credits
- [ ] Production build succeeds locally: `npm run build`
- [ ] Tests pass: `npm run test:ci`
- [ ] Debug routes reviewed (`/api/debug/*`) -- remove or restrict in production
- [ ] `NEXT_PUBLIC_APP_URL` set to the production domain (used for CORS and cookie configuration)
- [ ] Supabase project is on an appropriate plan for expected traffic

---

## 3. Vercel Deployment

### 3.1 Connect Repository

1. Go to [vercel.com](https://vercel.com) and sign up or log in.
2. Click **New Project**.
3. Import your GitHub repository containing the PrincipleLearn V3 code.
4. Vercel auto-detects the Next.js framework. Accept the default settings:
   - **Framework Preset**: Next.js
   - **Build Command**: `next build` (auto-detected)
   - **Output Directory**: `.next/` (auto-detected)
   - **Install Command**: `npm install` (auto-detected)

### 3.2 Configure Environment Variables

In **Vercel Dashboard > Project Settings > Environment Variables**, add the following:

| Variable | Example Value | Scope |
|----------|---------------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://abcdefg.supabase.co` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` | **Production only** |
| `JWT_SECRET` | *(64+ random hex chars)* | **Production only** |
| `OPENAI_API_KEY` | `sk-proj-...` | **Production only** |
| `OPENAI_MODEL` | `gpt-5-mini` | Production, Preview |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.vercel.app` | Production |

**Important security notes:**

- `SUPABASE_SERVICE_ROLE_KEY` and `JWT_SECRET` must **never** be set in the Preview scope. Preview deployments should not have access to production secrets.
- Use a **different** `JWT_SECRET` for production versus development. Tokens signed in one environment should not be valid in the other.
- Generate a strong `JWT_SECRET` with:
  ```bash
  openssl rand -hex 64
  ```
- `OPENAI_API_KEY` should only be set in Production scope to prevent preview deployments from consuming API credits.

### 3.3 Vercel Configuration

The project includes a `vercel.json` file at the repository root:

```json
{
  "functions": {
    "src/app/api/**/*.ts": {
      "maxDuration": 60
    }
  }
}
```

This sets a **60-second timeout** for all API routes. This is required because OpenAI API calls (course generation, streaming Q&A, challenge thinking) can take 30-90 seconds to complete. The default Vercel timeout of 10 seconds is insufficient.

> **Note**: On the Vercel Hobby plan, the maximum `maxDuration` is 60 seconds. On Pro plans, this can be increased to 300 seconds. If you experience timeouts on large course generation requests, consider upgrading your Vercel plan.

### 3.4 Deploy

There are two deployment methods:

**Automatic (recommended):**
- Push to the `main` branch to trigger an automatic production deployment.
- Push to any other branch to create a Preview deployment.

**Manual via Vercel CLI:**
```bash
# Install the Vercel CLI
npm i -g vercel

# Deploy to production
vercel --prod

# Deploy a preview
vercel
```

### 3.5 Custom Domain (Optional)

1. Go to **Project Settings > Domains** in the Vercel dashboard.
2. Add your custom domain (e.g., `learn.yourdomain.com`).
3. Update DNS records as instructed by Vercel (CNAME or A record).
4. Wait for SSL certificate provisioning (automatic, typically under 5 minutes).
5. **Critical**: Update the `NEXT_PUBLIC_APP_URL` environment variable to match your custom domain. This value controls CORS headers and cookie behavior.

---

## 4. Supabase Production Setup

### 4.1 Project Configuration

- Create a **separate** Supabase project for production. Do not share a project between development and production.
- Go to **Settings > Database > Backups** and verify that automated backups are enabled (daily backups on paid plans, point-in-time recovery on Pro+).
- Under **Settings > Auth**, configure email confirmation settings if required.
- Note your project URL and API keys from **Settings > API**.

### 4.2 Database Migration

Apply all SQL migrations in the Supabase SQL Editor (**SQL Editor > New Query**). Run the scripts from `docs/sql/` in the following order:

1. **Table creation scripts** -- create all core tables (`users`, `courses`, `subtopics`, `quiz`, `jurnal`, `transcript`, `user_progress`, `feedback`, `discussion_sessions`, `discussion_messages`, `ask_question_history`, `challenge_responses`, `api_logs`, `rate_limits`, `subtopic_cache`, etc.)
2. **`add_rls_policies_all_tables.sql`** -- Row Level Security policies for all tables
3. **Functions and views**:
   - `create_get_admin_user_stats_function.sql`
   - `create_get_jsonb_columns_function.sql`
4. **Schema alterations** (if upgrading from a previous version):
   - `add_quiz_submission_context_columns.sql`
   - `alter_learning_sessions_add_fields.sql`
   - `create_discussion_admin_actions.sql`
   - `create_transcript_table.sql`
   - `create_rate_limits_table.sql`
   - `create_research_tables.sql`
5. **Indexes** -- ensure indexes exist for frequently queried columns

Available SQL files in `docs/sql/`:

| File | Purpose |
|------|---------|
| `add_quiz_submission_context_columns.sql` | Add context columns to quiz submissions |
| `add_rls_policies_all_tables.sql` | RLS policies for all tables |
| `alter_learning_sessions_add_fields.sql` | Additional fields for learning sessions |
| `create_discussion_admin_actions.sql` | Admin discussion management |
| `create_get_admin_user_stats_function.sql` | Admin statistics function |
| `create_get_jsonb_columns_function.sql` | JSONB column detection utility |
| `create_rate_limits_table.sql` | Rate limiting persistence |
| `create_research_tables.sql` | Research/analytics tables |
| `create_transcript_table.sql` | Transcript storage |

### 4.3 Connection Architecture

The application connects to Supabase via the **PostgREST API** (Supabase JS client), not direct PostgreSQL connections. This means:

- No connection pooling configuration is needed on the application side.
- Supabase handles connection pooling internally via PgBouncer (port 6543).
- The application uses two client instances:
  - **`adminDb`** -- service role key, bypasses RLS (for backend operations)
  - **`publicDb`** -- anon key, respects RLS (for public reads)
- Database connection timeout is set to 10 seconds in code.

### 4.4 Row Level Security (RLS) Policies

Ensure all RLS policies are enabled after running the migration scripts:

- **Service role** (`adminDb`): Full access to all tables, bypasses RLS. Used by all API routes for backend operations.
- **Authenticated user policies**: Data isolation so users can only read/write their own records.
- **Public read policies**: Applied to shared content tables (templates, cached subtopics).

Verify RLS is enabled on every table by checking **Table Editor > (table) > RLS Enabled** in the Supabase dashboard.

---

## 5. Security Considerations for Production

### 5.1 JWT Secret

- Use a minimum of 64 random characters. Generate with: `openssl rand -hex 64`
- Never reuse the development secret in production.
- Rotate the secret periodically; note that rotation invalidates all existing sessions.

### 5.2 Cookie Security

Cookies are automatically secured in production. The application sets:

```typescript
secure: process.env.NODE_ENV === 'production'  // true on Vercel
httpOnly: true     // for access_token and refresh_token
sameSite: 'lax'    // CSRF protection
```

Verify that your production domain uses HTTPS (automatic on Vercel). Cookies with `secure: true` will not be sent over HTTP.

### 5.3 CORS Configuration

CORS headers are derived from the `NEXT_PUBLIC_APP_URL` environment variable:

```typescript
const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
```

If `NEXT_PUBLIC_APP_URL` is not set, the application falls back to `VERCEL_URL`. Always set `NEXT_PUBLIC_APP_URL` explicitly in production to avoid unexpected CORS behavior.

### 5.4 Rate Limiting

The application enforces the following rate limits (persisted to the `rate_limits` Supabase table):

| Endpoint | Limit | Window |
|----------|-------|--------|
| Login (`/api/auth/login`, `/api/admin/login`) | 5 attempts | 15 minutes |
| Registration (`/api/auth/register`) | 3 attempts | 1 hour |
| Password reset | 3 attempts | 1 hour |
| Password change | 5 attempts | 15 minutes |
| AI endpoints (course generation, Q&A, etc.) | 30 requests | 1 hour per user |

If the `rate_limits` table is unavailable, the limiter transparently falls back to in-memory storage. In serverless environments like Vercel, in-memory state is not shared across function invocations, so ensure the `rate_limits` table exists for reliable rate limiting.

### 5.5 Debug Routes

The application includes debug routes under `/api/debug/`. In production:

- Review all routes in `src/app/api/debug/` and remove or restrict them.
- Currently present: `/api/debug/course-test/[id]`
- These endpoints may expose internal data and should not be accessible in production.

### 5.6 CSRF Protection

The application uses a double-submit cookie pattern:

1. A `csrf_token` cookie (non-httpOnly, readable by JavaScript) is set on login.
2. The frontend reads this cookie and sends it as the `x-csrf-token` header on every request.
3. The `withProtection()` middleware validates that the header matches the cookie.

No additional configuration is needed for production. The CSRF token is automatically generated and validated.

---

## 6. Monitoring and Maintenance

### 6.1 Application Monitoring

- **Vercel Analytics**: Built-in performance monitoring and Web Vitals tracking. Enable in **Project Settings > Analytics**.
- **Vercel Logs**: Real-time function logs available in the Vercel dashboard under **Deployments > Functions**.
- **API Logging**: The application logs all API requests to the `api_logs` table via the `withApiLogging()` middleware. View logs through the admin dashboard at `/admin/dashboard` or via the `/api/admin/monitoring/logging` endpoint.
- **Admin Dashboard**: Access `/admin/dashboard` for system health overview, user statistics, and activity monitoring.

### 6.2 Database Monitoring

- **Supabase Dashboard**: Monitor query performance, storage usage, and connection counts under **Reports**.
- **`api_logs` table**: Contains request/response logging with duration measurements for performance analysis.
- **`rate_limits` table**: Monitor rate limit hits to detect potential abuse or misconfigured limits.
- **Database size**: Monitor storage usage; Supabase free tier has a 500MB limit.

### 6.3 OpenAI Usage Monitoring

- Monitor token usage and costs at [platform.openai.com/usage](https://platform.openai.com/usage).
- Check billing and credit balance regularly.
- The AI rate limiter (30 requests/hour per user) helps prevent runaway costs.
- The default model (`gpt-5-mini`) is cost-effective for educational content generation.
- Consider setting a monthly spending limit in the OpenAI dashboard.

### 6.4 Common Production Issues

| Issue | Symptoms | Solution |
|-------|----------|----------|
| API timeout (504) | Course generation fails | Increase `maxDuration` in `vercel.json`. Upgrade Vercel plan if needed. |
| OpenAI rate limit (429) | AI features return errors | Upgrade OpenAI plan or reduce AI rate limit per user. |
| Database connection errors | API returns 500 errors | Check Supabase project status. Verify `NEXT_PUBLIC_SUPABASE_URL` and keys. |
| CORS errors | Browser console shows blocked requests | Verify `NEXT_PUBLIC_APP_URL` matches the actual domain (including protocol). |
| Cookies not set | Users cannot log in | Ensure the site is served over HTTPS. Check `sameSite` and `secure` flags. |
| JWT validation failures | 401 errors after deployment | Ensure `JWT_SECRET` matches between token signing and verification. |
| Rate limit not working | Users bypass limits | Verify `rate_limits` table exists in Supabase. In-memory fallback does not persist across serverless invocations. |
| Build failures | Deployment fails on Vercel | Run `npm run build` locally to reproduce. Check for missing environment variables (some are validated at build time). |

---

## 7. Scaling Considerations

### 7.1 Vercel (Compute)

- Serverless functions auto-scale with traffic. No manual scaling configuration needed.
- Each function invocation is isolated; there is no shared in-memory state between invocations.
- Cold starts may add 200-500ms to the first request after idle periods.

### 7.2 Supabase (Database)

- **Free tier**: 500MB storage, limited to 2 concurrent direct connections. Suitable for development and small-scale testing only.
- **Pro tier**: 8GB storage, 60 concurrent connections, daily backups with point-in-time recovery. Recommended for production.
- The `subtopic_cache` table reduces redundant AI calls by caching generated subtopic content.
- Database indexes are already configured for key query patterns.

### 7.3 OpenAI (AI)

- Monitor token usage; `gpt-5-mini` is the most cost-effective model for this application.
- Course generation is the most token-intensive operation (generates full course outlines with subtopics).
- Streaming endpoints (`ask-question`, `challenge-thinking`) use `chatCompletionStream()` for real-time output, reducing perceived latency.
- Consider implementing response caching for frequently asked questions.

---

## 8. Rollback Strategy

### 8.1 Application Rollback (Vercel)

Vercel provides instant rollback capabilities:

1. Go to **Deployments** in the Vercel dashboard.
2. Find the previous working deployment.
3. Click the three-dot menu and select **Promote to Production**.
4. The rollback is instant with zero downtime.

### 8.2 Database Rollback (Supabase)

- **Free tier**: No automated recovery. Maintain manual SQL backups.
- **Pro tier**: Point-in-time recovery (PITR) allows restoring the database to any point within the retention period.
- **Manual backups**: Export critical data periodically via Supabase Dashboard > Database > Backups.
- Always test SQL migrations in a staging environment before applying to production.

### 8.3 Code Rollback (Git)

```bash
# Revert the most recent commit
git revert HEAD

# Revert a specific commit
git revert <commit-hash>

# Push the revert to trigger a new deployment
git push origin main
```

Prefer `git revert` over `git reset --hard` to maintain a clean history.

---

## 9. Environment-Specific Behavior

The application adapts its behavior based on the environment:

| Feature | Development | Production |
|---------|-------------|------------|
| Cookie `secure` flag | `false` | `true` (automatic via `NODE_ENV`) |
| CORS origin | `localhost:3000` (or unset) | `NEXT_PUBLIC_APP_URL` |
| Fast Refresh | Disabled (`FAST_REFRESH=false`) | N/A (no dev server) |
| Debug routes (`/api/debug/*`) | Accessible | Should be removed or restricted |
| Rate limiting | Active (same limits) | Active (same limits) |
| API logging (`api_logs` table) | Enabled | Enabled |
| CSRF protection | Enabled | Enabled |
| Token refresh | Enabled | Enabled |
| Supabase project | Development project | Separate production project |

---

## 10. Post-Deployment Verification

After deploying to production, verify the following:

1. **Homepage loads**: Visit your production URL and confirm the landing page renders.
2. **User registration**: Create a test account via `/signup`.
3. **User login**: Log in with the test account. Verify cookies are set (check browser DevTools > Application > Cookies).
4. **Admin login**: Log in at `/admin/login` with the admin account. Verify access to `/admin/dashboard`.
5. **Course creation**: Go through the full course request flow (`/request-course`) to verify OpenAI integration.
6. **API health**: Check that `/api/auth/me` returns the authenticated user.
7. **CORS**: Open browser DevTools > Console and verify no CORS errors during normal usage.
8. **SSL**: Verify the padlock icon in the browser address bar. All cookies require HTTPS.

---

## 11. Quick Reference

### Essential Commands

```bash
# Generate a secure JWT secret
openssl rand -hex 64

# Build locally to verify before deployment
npm run build

# Run all tests
npm run test:ci

# Deploy to production via Vercel CLI
vercel --prod

# Check deployment status
vercel ls
```

### Key URLs (After Deployment)

| URL | Purpose |
|-----|---------|
| `/` | Landing page |
| `/login` | User login |
| `/signup` | User registration |
| `/admin/login` | Admin login |
| `/admin/dashboard` | Admin dashboard and monitoring |
| `/dashboard` | User dashboard |
| `/request-course` | Course creation flow |
| `/api/auth/me` | Authentication health check |

### Support Resources

- **Vercel Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Supabase Documentation**: [supabase.com/docs](https://supabase.com/docs)
- **Next.js Documentation**: [nextjs.org/docs](https://nextjs.org/docs)
- **OpenAI API Reference**: [platform.openai.com/docs](https://platform.openai.com/docs)
