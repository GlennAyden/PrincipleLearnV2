ALTER TABLE public.jurnal
  ADD CONSTRAINT jurnal_user_course_unique
  UNIQUE (user_id, course_id);

ALTER TABLE public.transcript
  ADD CONSTRAINT transcript_user_course_subtopic_unique
  UNIQUE (user_id, course_id, subtopic_id);;
