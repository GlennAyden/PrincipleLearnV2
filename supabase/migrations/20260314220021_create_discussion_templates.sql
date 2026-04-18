
-- Discussion templates table
CREATE TABLE public.discussion_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  subtopic_id UUID REFERENCES public.subtopics(id) ON DELETE CASCADE,
  version TEXT,
  source JSONB,
  template JSONB,
  generated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_discussion_templates_subtopic ON public.discussion_templates(subtopic_id);
CREATE INDEX idx_discussion_templates_course ON public.discussion_templates(course_id);
;
