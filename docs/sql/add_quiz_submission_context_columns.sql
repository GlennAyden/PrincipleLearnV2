-- Add contextual tracing columns to quiz_submissions so admin/audit queries
-- can link records directly without depending on quiz table joins.

alter table if exists public.quiz_submissions
  add column if not exists course_id uuid null,
  add column if not exists subtopic_id uuid null,
  add column if not exists module_index integer null,
  add column if not exists subtopic_index integer null;

create index if not exists idx_quiz_submissions_course_id
  on public.quiz_submissions (course_id);

create index if not exists idx_quiz_submissions_subtopic_id
  on public.quiz_submissions (subtopic_id);

create index if not exists idx_quiz_submissions_course_subtopic
  on public.quiz_submissions (course_id, subtopic_id);
