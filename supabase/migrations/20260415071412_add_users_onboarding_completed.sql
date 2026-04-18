ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_pending_onboarding_idx
  ON public.users (id)
  WHERE onboarding_completed = FALSE;;
