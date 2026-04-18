
-- Fase C: schema backfill untuk integritas data

-- 0) Bersihkan 2 orphan course_id di course_generation_activity
UPDATE public.course_generation_activity
SET course_id = NULL
WHERE course_id IS NOT NULL
  AND course_id NOT IN (SELECT id FROM public.courses);

-- 1) challenge_responses: varchar -> uuid + FK
DROP POLICY IF EXISTS challenge_responses_own ON public.challenge_responses;

ALTER TABLE public.challenge_responses
  ALTER COLUMN id TYPE uuid USING id::uuid,
  ALTER COLUMN user_id TYPE uuid USING user_id::uuid,
  ALTER COLUMN course_id TYPE uuid USING course_id::uuid;

ALTER TABLE public.challenge_responses
  ADD CONSTRAINT challenge_responses_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.challenge_responses
  ADD CONSTRAINT challenge_responses_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

CREATE POLICY challenge_responses_own ON public.challenge_responses
  FOR ALL
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- 2) course_generation_activity: add FKs
ALTER TABLE public.course_generation_activity
  ADD CONSTRAINT course_generation_activity_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.course_generation_activity
  ADD CONSTRAINT course_generation_activity_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;

-- 3) NOT NULL constraints pada kolom yang wajib
ALTER TABLE public.quiz
  ALTER COLUMN course_id SET NOT NULL,
  ALTER COLUMN subtopic_id SET NOT NULL;

ALTER TABLE public.quiz_submissions
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN quiz_id SET NOT NULL;

ALTER TABLE public.jurnal
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN course_id SET NOT NULL;

-- 4) jurnal unique constraint (cegah overwrite bug per subtopic)
--    NULLS NOT DISTINCT -> NULL subtopic_id dianggap sama (PG15+)
ALTER TABLE public.jurnal
  ADD CONSTRAINT jurnal_user_course_subtopic_unique
  UNIQUE NULLS NOT DISTINCT (user_id, course_id, subtopic_id);

-- 5) CHECK constraints untuk domain yang terbatas
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (lower(role) IN ('user','admin'));

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_rating_check
  CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5));

-- 6) Update get_admin_user_stats: hapus cast u.id::text karena challenge_responses.user_id sekarang uuid
CREATE OR REPLACE FUNCTION public.get_admin_user_stats()
RETURNS TABLE (
  id uuid,
  email text,
  name text,
  role text,
  created_at timestamptz,
  total_courses bigint,
  total_quizzes bigint,
  total_journals bigint,
  total_transcripts bigint,
  total_ask_questions bigint,
  total_challenges bigint,
  total_discussions bigint,
  total_feedbacks bigint,
  completed_progress bigint,
  total_progress bigint,
  last_activity timestamptz
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.created_at,
    COALESCE(c.cnt, 0)            AS total_courses,
    COALESCE(qs.cnt, 0)           AS total_quizzes,
    COALESCE(j.cnt, 0)            AS total_journals,
    COALESCE(t.cnt, 0)            AS total_transcripts,
    COALESCE(aq.cnt, 0)           AS total_ask_questions,
    COALESCE(cr.cnt, 0)           AS total_challenges,
    COALESCE(ds.cnt, 0)           AS total_discussions,
    COALESCE(fb.cnt, 0)           AS total_feedbacks,
    COALESCE(up_done.cnt, 0)      AS completed_progress,
    COALESCE(up_all.cnt, 0)       AS total_progress,
    GREATEST(
      u.created_at,
      c.last_at, qs.last_at, j.last_at, t.last_at,
      aq.last_at, cr.last_at, ds.last_at, fb.last_at
    ) AS last_activity
  FROM public.users u
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(courses.created_at) AS last_at
    FROM public.courses WHERE courses.created_by = u.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(quiz_submissions.created_at) AS last_at
    FROM public.quiz_submissions WHERE quiz_submissions.user_id = u.id
  ) qs ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(jurnal.created_at) AS last_at
    FROM public.jurnal WHERE jurnal.user_id = u.id
  ) j ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(transcript.created_at) AS last_at
    FROM public.transcript WHERE transcript.user_id = u.id
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(ask_question_history.created_at) AS last_at
    FROM public.ask_question_history WHERE ask_question_history.user_id = u.id
  ) aq ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(challenge_responses.created_at) AS last_at
    FROM public.challenge_responses WHERE challenge_responses.user_id = u.id
  ) cr ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(COALESCE(discussion_sessions.updated_at, discussion_sessions.created_at)) AS last_at
    FROM public.discussion_sessions WHERE discussion_sessions.user_id = u.id
  ) ds ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(feedback.created_at) AS last_at
    FROM public.feedback WHERE feedback.user_id = u.id
  ) fb ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.user_progress WHERE user_progress.user_id = u.id AND user_progress.is_completed = true
  ) up_done ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.user_progress WHERE user_progress.user_id = u.id
  ) up_all ON true
  WHERE u.deleted_at IS NULL
  ORDER BY u.created_at DESC;
$$;
;
