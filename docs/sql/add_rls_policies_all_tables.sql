-- ============================================================
-- RLS Policies for PrincipleLearn
-- Applied: 2026-04-05
--
-- Strategy:
--   1. service_role gets full access (bypasses RLS anyway, but explicit)
--   2. authenticated users can read/write their OWN data (user_id match)
--   3. Shared content tables allow read by any authenticated user
--   4. System/admin tables are service_role only
-- ============================================================

-- Drop broken allow-all policies
DROP POLICY IF EXISTS "Service role full access on ask_question_history" ON public.ask_question_history;
DROP POLICY IF EXISTS "Service role full access on challenge_responses" ON public.challenge_responses;
DROP POLICY IF EXISTS "Service role full access to discussion_admin_actions" ON public.discussion_admin_actions;

-- service_role full access on all 26 tables
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

-- User-scoped policies (authenticated users access own data only)
CREATE POLICY "users_read_own" ON public.users FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "courses_read_own" ON public.courses FOR SELECT TO authenticated USING (created_by = auth.uid());
CREATE POLICY "courses_insert_own" ON public.courses FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "courses_delete_own" ON public.courses FOR DELETE TO authenticated USING (created_by = auth.uid());
CREATE POLICY "subtopics_read_own_course" ON public.subtopics FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = subtopics.course_id AND courses.created_by = auth.uid()));
CREATE POLICY "quiz_read_own_course" ON public.quiz FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.courses WHERE courses.id = quiz.course_id AND courses.created_by = auth.uid()));
CREATE POLICY "quiz_submissions_own" ON public.quiz_submissions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "jurnal_own" ON public.jurnal FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "transcript_own" ON public.transcript FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "feedback_own" ON public.feedback FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_progress_own" ON public.user_progress FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "ask_question_history_own" ON public.ask_question_history FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "challenge_responses_own" ON public.challenge_responses FOR ALL TO authenticated USING (user_id::text = auth.uid()::text) WITH CHECK (user_id::text = auth.uid()::text);
CREATE POLICY "learning_profiles_own" ON public.learning_profiles FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "course_gen_activity_own" ON public.course_generation_activity FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "discussion_sessions_own" ON public.discussion_sessions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "discussion_messages_own_session" ON public.discussion_messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.discussion_sessions WHERE discussion_sessions.id = discussion_messages.session_id AND discussion_sessions.user_id = auth.uid()));
CREATE POLICY "learning_sessions_own" ON public.learning_sessions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "prompt_classifications_own" ON public.prompt_classifications FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "prompt_revisions_own" ON public.prompt_revisions FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "cognitive_indicators_own" ON public.cognitive_indicators FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "research_artifacts_own" ON public.research_artifacts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "triangulation_records_own" ON public.triangulation_records FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Shared read-only for authenticated users
CREATE POLICY "discussion_templates_read" ON public.discussion_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "subtopic_cache_read" ON public.subtopic_cache FOR SELECT TO authenticated USING (true);

-- System tables (api_logs, inter_rater_reliability, discussion_admin_actions)
-- have NO authenticated policies → only service_role can access
