CREATE UNIQUE INDEX IF NOT EXISTS discussion_sessions_user_course_subtopic_unique
  ON public.discussion_sessions (user_id, course_id, subtopic_id)
  WHERE subtopic_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS discussion_sessions_user_course_null_subtopic_unique
  ON public.discussion_sessions (user_id, course_id)
  WHERE subtopic_id IS NULL;;
