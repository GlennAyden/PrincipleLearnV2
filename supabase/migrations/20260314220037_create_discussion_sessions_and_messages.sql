
-- Discussion sessions table
CREATE TABLE public.discussion_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  subtopic_id UUID NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.discussion_templates(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  phase TEXT,
  learning_goals JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discussion_sessions_user ON public.discussion_sessions(user_id);
CREATE INDEX idx_discussion_sessions_course ON public.discussion_sessions(course_id);
CREATE INDEX idx_discussion_sessions_subtopic ON public.discussion_sessions(subtopic_id);

-- Discussion messages table
CREATE TABLE public.discussion_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.discussion_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  step_key TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discussion_messages_session ON public.discussion_messages(session_id);
;
