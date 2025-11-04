-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "difficulty_level" TEXT,
    "estimated_duration" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtopics" (
    "id" UUID NOT NULL,
    "course_id" UUID,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtopics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz" (
    "id" UUID NOT NULL,
    "course_id" UUID,
    "subtopic_id" UUID,
    "question" TEXT NOT NULL,
    "options" JSONB,
    "correct_answer" TEXT,
    "explanation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_submissions" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "quiz_id" UUID,
    "answer" TEXT,
    "is_correct" BOOLEAN,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jurnal" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "course_id" UUID,
    "content" TEXT NOT NULL,
    "reflection" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jurnal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "course_id" UUID,
    "subtopic_id" UUID,
    "content" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ask_question_history" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "course_id" UUID,
    "module_index" INTEGER,
    "subtopic_index" INTEGER,
    "page_number" INTEGER,
    "subtopic_label" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ask_question_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "course_id" UUID,
    "subtopic_id" UUID,
    "is_completed" BOOLEAN DEFAULT false,
    "completion_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "course_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_logs" (
    "id" UUID NOT NULL,
    "method" TEXT,
    "path" TEXT,
    "query" TEXT,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" TEXT,
    "user_email" TEXT,
    "user_role" TEXT,
    "label" TEXT,
    "metadata" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_templates" (
    "id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "subtopic_id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "source" JSONB NOT NULL,
    "template" JSONB NOT NULL,
    "generated_by" TEXT NOT NULL DEFAULT 'auto',
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "course_id" UUID NOT NULL,
    "subtopic_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "learning_goals" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discussion_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "step_key" TEXT,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_admin_actions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "admin_id" TEXT,
    "admin_email" TEXT,
    "action" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtopic_cache" (
    "id" UUID NOT NULL,
    "cache_key" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subtopic_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_responses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "module_index" INTEGER,
    "subtopic_index" INTEGER,
    "page_number" INTEGER,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_ask_question_history_user_id" ON "ask_question_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_ask_question_history_course_id" ON "ask_question_history"("course_id");

-- CreateIndex
CREATE INDEX "idx_ask_question_history_created_at" ON "ask_question_history"("created_at");

-- CreateIndex
CREATE INDEX "idx_ask_question_history_user_course" ON "ask_question_history"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "idx_user_progress_user_id" ON "user_progress"("user_id");

-- CreateIndex
CREATE INDEX "idx_feedback_user_id" ON "feedback"("user_id");

-- CreateIndex
CREATE INDEX "idx_api_logs_created_at" ON "api_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_api_logs_path" ON "api_logs"("path");

-- CreateIndex
CREATE UNIQUE INDEX "discussion_templates_unique" ON "discussion_templates"("subtopic_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "discussion_sessions_user_id_subtopic_id_key" ON "discussion_sessions"("user_id", "subtopic_id");

-- CreateIndex
CREATE INDEX "discussion_messages_session_idx" ON "discussion_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_discussion_admin_actions_session" ON "discussion_admin_actions"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "subtopic_cache_cache_key_key" ON "subtopic_cache"("cache_key");

-- CreateIndex
CREATE INDEX "idx_subtopic_cache_created" ON "subtopic_cache"("created_at");

-- CreateIndex
CREATE INDEX "idx_challenge_responses_user_id" ON "challenge_responses"("user_id");

-- CreateIndex
CREATE INDEX "idx_challenge_responses_course_id" ON "challenge_responses"("course_id");

-- CreateIndex
CREATE INDEX "idx_challenge_responses_user_course" ON "challenge_responses"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "idx_challenge_responses_created_at" ON "challenge_responses"("created_at");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz" ADD CONSTRAINT "quiz_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_submissions" ADD CONSTRAINT "quiz_submissions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "quiz"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurnal" ADD CONSTRAINT "jurnal_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jurnal" ADD CONSTRAINT "jurnal_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_question_history" ADD CONSTRAINT "ask_question_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ask_question_history" ADD CONSTRAINT "ask_question_history_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_templates" ADD CONSTRAINT "discussion_templates_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_templates" ADD CONSTRAINT "discussion_templates_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_sessions" ADD CONSTRAINT "discussion_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_sessions" ADD CONSTRAINT "discussion_sessions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_sessions" ADD CONSTRAINT "discussion_sessions_subtopic_id_fkey" FOREIGN KEY ("subtopic_id") REFERENCES "subtopics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_sessions" ADD CONSTRAINT "discussion_sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "discussion_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_messages" ADD CONSTRAINT "discussion_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "discussion_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_admin_actions" ADD CONSTRAINT "discussion_admin_actions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "discussion_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
