
-- ============================================================
-- RLS Policies for PrincipleLearn
--
-- Strategy:
--   1. service_role gets full access (bypasses RLS anyway, but explicit for clarity)
--   2. authenticated users can read/write their OWN data (user_id match)
--   3. Shared content tables (courses, subtopics, quiz, etc.) allow read by any authenticated user
--      but write only by the owner
--   4. System tables (api_logs, cache) are service_role only
--   5. Research/admin tables are service_role only
--
-- The app backend uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- These policies protect against anon key leakage or future client-side Supabase usage.
-- ============================================================

-- ── Step 1: Drop existing broken policies ────────────────────

DROP POLICY IF EXISTS "Service role full access on ask_question_history" ON public.ask_question_history;
DROP POLICY IF EXISTS "Service role full access on challenge_responses" ON public.challenge_responses;
DROP POLICY IF EXISTS "Service role full access to discussion_admin_actions" ON public.discussion_admin_actions;

-- ── Step 2: Service-role full access on all tables ───────────
-- (service_role bypasses RLS, but explicit policies make intent clear)

CREATE POLICY "service_role_full_access" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.courses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.subtopics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.quiz FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.quiz_submissions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.jurnal FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.transcript FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.user_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.ask_question_history FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.challenge_responses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.learning_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.course_generation_activity FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.discussion_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.discussion_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.discussion_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.discussion_admin_actions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.subtopic_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.api_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.learning_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.prompt_classifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.prompt_revisions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.cognitive_indicators FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.research_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.triangulation_records FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.inter_rater_reliability FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Step 3: User-scoped policies for authenticated users ─────
-- Users can only read/write their own data via the anon/authenticated role

-- users: can read own profile only
CREATE POLICY "users_read_own" ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid());

-- courses: read own courses, write own courses
CREATE POLICY "courses_read_own" ON public.courses FOR SELECT TO authenticated
  USING (created_by = auth.uid());
CREATE POLICY "courses_insert_own" ON public.courses FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "courses_delete_own" ON public.courses FOR DELETE TO authenticated
  USING (created_by = auth.uid());

-- subtopics: read if user owns the parent course
CREATE POLICY "subtopics_read_own_course" ON public.subtopics FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = subtopics.course_id AND courses.created_by = auth.uid()));

-- quiz: read if user owns the parent course
CREATE POLICY "quiz_read_own_course" ON public.quiz FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = quiz.course_id AND courses.created_by = auth.uid()));

-- quiz_submissions: own data only
CREATE POLICY "quiz_submissions_own" ON public.quiz_submissions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- jurnal: own data only
CREATE POLICY "jurnal_own" ON public.jurnal FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- transcript: own data only
CREATE POLICY "transcript_own" ON public.transcript FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- feedback: own data only
CREATE POLICY "feedback_own" ON public.feedback FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_progress: own data only
CREATE POLICY "user_progress_own" ON public.user_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ask_question_history: own data only
CREATE POLICY "ask_question_history_own" ON public.ask_question_history FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- challenge_responses: own data only
CREATE POLICY "challenge_responses_own" ON public.challenge_responses FOR ALL TO authenticated
  USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);

-- learning_profiles: own data only
CREATE POLICY "learning_profiles_own" ON public.learning_profiles FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- course_generation_activity: own data only
CREATE POLICY "course_gen_activity_own" ON public.course_generation_activity FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- discussion_sessions: own data only
CREATE POLICY "discussion_sessions_own" ON public.discussion_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- discussion_messages: read own session messages
CREATE POLICY "discussion_messages_own_session" ON public.discussion_messages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.discussion_sessions WHERE discussion_sessions.id = discussion_messages.session_id AND discussion_sessions.user_id = auth.uid()));

-- learning_sessions: own data only
CREATE POLICY "learning_sessions_own" ON public.learning_sessions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- prompt_classifications: own data only
CREATE POLICY "prompt_classifications_own" ON public.prompt_classifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- prompt_revisions: own data only
CREATE POLICY "prompt_revisions_own" ON public.prompt_revisions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- cognitive_indicators: own data only
CREATE POLICY "cognitive_indicators_own" ON public.cognitive_indicators FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- research_artifacts: own data only
CREATE POLICY "research_artifacts_own" ON public.research_artifacts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- triangulation_records: own data only
CREATE POLICY "triangulation_records_own" ON public.triangulation_records FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── Step 4: Shared content tables (read-only for authenticated) ──

-- discussion_templates: any authenticated user can read
CREATE POLICY "discussion_templates_read" ON public.discussion_templates FOR SELECT TO authenticated
  USING (true);

-- subtopic_cache: any authenticated user can read cached content
CREATE POLICY "subtopic_cache_read" ON public.subtopic_cache FOR SELECT TO authenticated
  USING (true);

-- ── Step 5: System/admin-only tables — NO authenticated access ──
-- api_logs, inter_rater_reliability, discussion_admin_actions
-- These have no authenticated policies → only service_role can access
;
