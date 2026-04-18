ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS method        TEXT,
  ADD COLUMN IF NOT EXISTS path          TEXT,
  ADD COLUMN IF NOT EXISTS query         TEXT,
  ADD COLUMN IF NOT EXISTS status_code   INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms   INTEGER;

ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS ip_address    TEXT,
  ADD COLUMN IF NOT EXISTS user_agent    TEXT;

ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS user_email_hash TEXT,
  ADD COLUMN IF NOT EXISTS user_role       TEXT;

ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS label         TEXT,
  ADD COLUMN IF NOT EXISTS metadata      JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE public.api_logs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS api_logs_created_at_idx
  ON public.api_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS api_logs_path_created_at_idx
  ON public.api_logs (path, created_at DESC);

CREATE INDEX IF NOT EXISTS api_logs_user_id_idx
  ON public.api_logs (user_id)
  WHERE user_id IS NOT NULL;;
