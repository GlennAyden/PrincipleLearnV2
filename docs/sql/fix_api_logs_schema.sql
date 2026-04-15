-- docs/sql/fix_api_logs_schema.sql
--
-- Aligns the `api_logs` table with the columns currently written by
-- src/lib/api-logger.ts (`logApiCall`) and read by
-- src/app/api/admin/monitoring/logging/route.ts (which selects `path`,
-- `status_code`, `created_at`, `error_message`).
--
-- Historical note: docs/DATABASE_SCHEMA.md §5.6 describes an older column
-- layout (`endpoint`, `statusCode` camelCase, `duration`). The application
-- code has since diverged to a richer, snake_case schema. This migration
-- brings the database up to the code's expectation without dropping any
-- legacy columns — if the older columns still exist, they are left in place
-- so existing rows remain queryable.
--
-- Safe to run multiple times: every ADD COLUMN uses IF NOT EXISTS.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ DO NOT EXECUTE THIS FILE AUTOMATICALLY — apply manually via Supabase │
-- │ SQL editor or psql after reviewing impact in a staging environment.  │
-- └──────────────────────────────────────────────────────────────────────┘

BEGIN;

-- Core request metadata
ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS method        TEXT,
  ADD COLUMN IF NOT EXISTS path          TEXT,
  ADD COLUMN IF NOT EXISTS query         TEXT,
  ADD COLUMN IF NOT EXISTS status_code   INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms   INTEGER;

-- Client context
ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS ip_address    TEXT,
  ADD COLUMN IF NOT EXISTS user_agent    TEXT;

-- Identity (PII-safe: we only store the UUID + SHA-256-prefixed email hash,
-- NOT the raw email address). See src/lib/api-logger.ts → hashEmail().
ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS user_id         UUID,
  ADD COLUMN IF NOT EXISTS user_email_hash TEXT,
  ADD COLUMN IF NOT EXISTS user_role       TEXT;

-- Request labelling + failure info
ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS label         TEXT,
  ADD COLUMN IF NOT EXISTS metadata      JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Ensure created_at exists even on very old snapshots of the table
ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Indexes to keep the admin monitoring endpoint fast
CREATE INDEX IF NOT EXISTS api_logs_created_at_idx
  ON public.api_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS api_logs_path_created_at_idx
  ON public.api_logs (path, created_at DESC);

CREATE INDEX IF NOT EXISTS api_logs_user_id_idx
  ON public.api_logs (user_id)
  WHERE user_id IS NOT NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- PII REMOVAL (run manually, irreversible):
--
-- If the legacy `user_email` column still exists and contains raw addresses,
-- drop it AFTER confirming nothing reads from it (the current code uses
-- `user_email_hash` only):
--
--   ALTER TABLE public.api_logs DROP COLUMN IF EXISTS user_email;
--
-- Or, to keep the column but purge the plaintext:
--
--   UPDATE public.api_logs
--      SET user_email = NULL
--    WHERE user_email IS NOT NULL;
-- ─────────────────────────────────────────────────────────────────────────
