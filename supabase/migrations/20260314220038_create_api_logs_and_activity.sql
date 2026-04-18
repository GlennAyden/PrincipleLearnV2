
-- API logs table
CREATE TABLE public.api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method TEXT,
  path TEXT,
  query TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT,
  user_email TEXT,
  user_role TEXT,
  label TEXT,
  metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_logs_created_at ON public.api_logs(created_at);
CREATE INDEX idx_api_logs_path ON public.api_logs(path);

-- Course generation activity table
CREATE TABLE public.course_generation_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  course_id UUID,
  request_payload JSONB,
  outline JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_gen_activity_user ON public.course_generation_activity(user_id);
;
