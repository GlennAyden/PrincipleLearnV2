
-- Fase D: RLS performance rewrites + FK indexes + drop duplikat

-- 1) Rewrite 21 policies ke (select auth.uid()) untuk performa per-row
DROP POLICY IF EXISTS ask_question_history_own ON public.ask_question_history;
CREATE POLICY ask_question_history_own ON public.ask_question_history
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS cognitive_indicators_own ON public.cognitive_indicators;
CREATE POLICY cognitive_indicators_own ON public.cognitive_indicators
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS course_gen_activity_own ON public.course_generation_activity;
CREATE POLICY course_gen_activity_own ON public.course_generation_activity
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS courses_read_own ON public.courses;
CREATE POLICY courses_read_own ON public.courses
  FOR SELECT TO authenticated
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS courses_delete_own ON public.courses;
CREATE POLICY courses_delete_own ON public.courses
  FOR DELETE TO authenticated
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS discussion_messages_own_session ON public.discussion_messages;
CREATE POLICY discussion_messages_own_session ON public.discussion_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.discussion_sessions
    WHERE discussion_sessions.id = discussion_messages.session_id
      AND discussion_sessions.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS discussion_sessions_own ON public.discussion_sessions;
CREATE POLICY discussion_sessions_own ON public.discussion_sessions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS feedback_own ON public.feedback;
CREATE POLICY feedback_own ON public.feedback
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS jurnal_own ON public.jurnal;
CREATE POLICY jurnal_own ON public.jurnal
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS learning_profiles_own ON public.learning_profiles;
CREATE POLICY learning_profiles_own ON public.learning_profiles
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS learning_sessions_own ON public.learning_sessions;
CREATE POLICY learning_sessions_own ON public.learning_sessions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS prompt_classifications_own ON public.prompt_classifications;
CREATE POLICY prompt_classifications_own ON public.prompt_classifications
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS prompt_revisions_own ON public.prompt_revisions;
CREATE POLICY prompt_revisions_own ON public.prompt_revisions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS quiz_read_own_course ON public.quiz;
CREATE POLICY quiz_read_own_course ON public.quiz
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = quiz.course_id
      AND courses.created_by = (select auth.uid())
  ));

DROP POLICY IF EXISTS quiz_submissions_own ON public.quiz_submissions;
CREATE POLICY quiz_submissions_own ON public.quiz_submissions
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS research_artifacts_own ON public.research_artifacts;
CREATE POLICY research_artifacts_own ON public.research_artifacts
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS subtopics_read_own_course ON public.subtopics;
CREATE POLICY subtopics_read_own_course ON public.subtopics
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.courses
    WHERE courses.id = subtopics.course_id
      AND courses.created_by = (select auth.uid())
  ));

DROP POLICY IF EXISTS transcript_own ON public.transcript;
CREATE POLICY transcript_own ON public.transcript
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS triangulation_records_own ON public.triangulation_records;
CREATE POLICY triangulation_records_own ON public.triangulation_records
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS user_progress_own ON public.user_progress;
CREATE POLICY user_progress_own ON public.user_progress
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS users_read_own ON public.users;
CREATE POLICY users_read_own ON public.users
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));

-- 2) Tambah FK index yang hilang (hanya tabel yang dipakai)
CREATE INDEX IF NOT EXISTS idx_user_progress_course_id ON public.user_progress (course_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_subtopic_id ON public.user_progress (subtopic_id);
CREATE INDEX IF NOT EXISTS idx_jurnal_subtopic_id ON public.jurnal (subtopic_id);
CREATE INDEX IF NOT EXISTS idx_feedback_subtopic_id ON public.feedback (subtopic_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_learning_session_id ON public.ask_question_history (learning_session_id);
CREATE INDEX IF NOT EXISTS idx_challenge_responses_learning_session_id ON public.challenge_responses (learning_session_id);
CREATE INDEX IF NOT EXISTS idx_course_gen_activity_course_id ON public.course_generation_activity (course_id);

-- 3) Drop duplicate indexes
DROP INDEX IF EXISTS public.idx_users_email;
DROP INDEX IF EXISTS public.idx_api_logs_created_at;
DROP INDEX IF EXISTS public.idx_ask_question_history_user_id;
;
