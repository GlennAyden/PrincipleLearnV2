DROP TABLE IF EXISTS public.discussion_admin_actions CASCADE;
DROP TABLE IF EXISTS public.discussion_messages CASCADE;
DROP TABLE IF EXISTS public.discussion_sessions CASCADE;
DROP TABLE IF EXISTS public.discussion_templates CASCADE;
DROP TABLE IF EXISTS public.ask_question_history CASCADE;
DROP TABLE IF EXISTS public.challenge_responses CASCADE;
DROP TABLE IF EXISTS public.feedback CASCADE;
DROP TABLE IF EXISTS public.course_generation_activity CASCADE;
DROP TABLE IF EXISTS public.jurnal CASCADE;
DROP TABLE IF EXISTS public.quiz_submissions CASCADE;
DROP TABLE IF EXISTS public.quiz CASCADE;
DROP TABLE IF EXISTS public.transcript CASCADE;
DROP TABLE IF EXISTS public.user_progress CASCADE;
DROP TABLE IF EXISTS public.subtopics CASCADE;
DROP TABLE IF EXISTS public.courses CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.api_logs CASCADE;

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email character varying NOT NULL UNIQUE,
  password_hash character varying NOT NULL,
  name character varying,
  role character varying DEFAULT 'user'::character varying,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title character varying NOT NULL,
  description text,
  subject character varying,
  difficulty_level character varying,
  estimated_duration integer,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);

CREATE TABLE public.subtopics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid,
  title character varying NOT NULL,
  content text,
  order_index integer NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT subtopics_pkey PRIMARY KEY (id),
  CONSTRAINT subtopics_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);

CREATE TABLE public.discussion_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  subtopic_id uuid NOT NULL,
  version text NOT NULL,
  source jsonb NOT NULL,
  template jsonb NOT NULL,
  generated_by text NOT NULL DEFAULT 'auto'::text,
  status text NOT NULL DEFAULT 'ready'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT discussion_templates_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_templates_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT discussion_templates_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id)
);

CREATE TABLE public.discussion_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  subtopic_id uuid NOT NULL,
  template_id uuid NOT NULL,
  status text NOT NULL CHECK (status = ANY (ARRAY['in_progress'::text, 'completed'::text, 'abandoned'::text])),
  phase text NOT NULL,
  learning_goals jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT discussion_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT discussion_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT discussion_sessions_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id),
  CONSTRAINT discussion_sessions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.discussion_templates(id)
);

CREATE TABLE public.discussion_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['agent'::text, 'student'::text, 'system'::text])),
  content text NOT NULL,
  step_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT discussion_messages_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.discussion_sessions(id)
);

CREATE TABLE public.discussion_admin_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  admin_id text,
  admin_email text,
  action character varying,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT discussion_admin_actions_pkey PRIMARY KEY (id),
  CONSTRAINT discussion_admin_actions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.discussion_sessions(id)
);

CREATE TABLE public.ask_question_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  module_index integer DEFAULT 0,
  subtopic_index integer DEFAULT 0,
  page_number integer DEFAULT 0,
  subtopic_label text,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT ask_question_history_pkey PRIMARY KEY (id),
  CONSTRAINT ask_question_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT ask_question_history_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);

CREATE TABLE public.challenge_responses (
  id text NOT NULL,
  user_id text NOT NULL,
  course_id text NOT NULL,
  module_index integer DEFAULT 0,
  subtopic_index integer DEFAULT 0,
  page_number integer DEFAULT 0,
  question text NOT NULL,
  answer text NOT NULL,
  feedback text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT challenge_responses_pkey PRIMARY KEY (id)
);

CREATE TABLE public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  subtopic_id uuid,
  module_index integer,
  subtopic_index integer,
  subtopic_label text,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id),
  CONSTRAINT feedback_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT feedback_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id),
  CONSTRAINT feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.course_generation_activity (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  request_payload jsonb NOT NULL,
  outline jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT course_generation_activity_pkey PRIMARY KEY (id),
  CONSTRAINT course_generation_activity_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT course_generation_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.jurnal (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  content text NOT NULL,
  reflection text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT jurnal_pkey PRIMARY KEY (id),
  CONSTRAINT jurnal_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT jurnal_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.quiz (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid,
  subtopic_id uuid,
  question text NOT NULL,
  options jsonb,
  correct_answer character varying,
  explanation text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quiz_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT quiz_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id)
);

CREATE TABLE public.quiz_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  quiz_id uuid,
  answer character varying,
  is_correct boolean,
  submitted_at timestamp with time zone DEFAULT now(),
  CONSTRAINT quiz_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT quiz_submissions_quiz_id_fkey FOREIGN KEY (quiz_id) REFERENCES public.quiz(id),
  CONSTRAINT quiz_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.transcript (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  subtopic_id uuid,
  content text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT transcript_pkey PRIMARY KEY (id),
  CONSTRAINT transcript_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT transcript_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id),
  CONSTRAINT transcript_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.user_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  subtopic_id uuid,
  is_completed boolean DEFAULT false,
  completion_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_progress_pkey PRIMARY KEY (id),
  CONSTRAINT user_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT user_progress_subtopic_id_fkey FOREIGN KEY (subtopic_id) REFERENCES public.subtopics(id),
  CONSTRAINT user_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);

CREATE TABLE public.api_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  method character varying,
  path text,
  query text,
  status_code integer,
  duration_ms integer,
  ip_address character varying,
  user_agent text,
  user_id text,
  user_email text,
  user_role text,
  label text,
  metadata jsonb,
  error_message text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT api_logs_pkey PRIMARY KEY (id)
);
