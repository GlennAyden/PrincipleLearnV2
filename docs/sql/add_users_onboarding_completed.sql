-- docs/sql/add_users_onboarding_completed.sql
--
-- Adds an `onboarding_completed` flag to the `users` table so the server has
-- a durable source of truth for whether a user has finished the onboarding
-- flow (currently the app relies on a client-set `onboarding_done` cookie
-- plus the presence of a row in `learning_profiles`).
--
-- Safe to run multiple times: all statements use IF NOT EXISTS / IF EXISTS.
-- Does NOT backfill from learning_profiles; run the backfill block at the
-- bottom separately once you have verified the column has been added.
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ DO NOT EXECUTE THIS FILE AUTOMATICALLY — apply manually via Supabase │
-- │ SQL editor or psql after reviewing impact in a staging environment.  │
-- └──────────────────────────────────────────────────────────────────────┘

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index to make "users who still need onboarding" queries cheap.
CREATE INDEX IF NOT EXISTS users_pending_onboarding_idx
  ON public.users (id)
  WHERE onboarding_completed = FALSE;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- OPTIONAL BACKFILL (run manually after verifying the column exists):
--
--   UPDATE public.users u
--   SET onboarding_completed = TRUE
--   WHERE EXISTS (
--     SELECT 1 FROM public.learning_profiles lp
--     WHERE lp.user_id = u.id
--   )
--     AND u.onboarding_completed = FALSE;
--
-- After the backfill, the application can switch the middleware onboarding
-- gate from the `onboarding_done` cookie to a JWT claim sourced from this
-- column (will require updating the auth service to include the flag in
-- the access token payload on login/refresh).
-- ─────────────────────────────────────────────────────────────────────────
