ALTER TABLE public.jurnal
  DROP CONSTRAINT IF EXISTS jurnal_user_course_unique;

ALTER TABLE public.jurnal
  DROP CONSTRAINT IF EXISTS jurnal_user_course_subtopic_unique;;
