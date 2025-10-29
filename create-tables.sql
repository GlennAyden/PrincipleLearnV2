-- Create database tables for the learning application

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(100),
    difficulty_level VARCHAR(50),
    estimated_duration INTEGER, -- in minutes
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Subtopics table
CREATE TABLE IF NOT EXISTS subtopics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quiz table
CREATE TABLE IF NOT EXISTS quiz (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options JSONB, -- Array of options
    correct_answer VARCHAR(255),
    explanation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quiz submissions table
CREATE TABLE IF NOT EXISTS quiz_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    quiz_id UUID REFERENCES quiz(id) ON DELETE CASCADE,
    answer VARCHAR(255),
    is_correct BOOLEAN,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Journal entries table
CREATE TABLE IF NOT EXISTS jurnal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    reflection TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Transcript/notes table
CREATE TABLE IF NOT EXISTS transcript (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ask Question history table
CREATE TABLE IF NOT EXISTS ask_question_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    module_index INTEGER DEFAULT 0,
    subtopic_index INTEGER DEFAULT 0,
    page_number INTEGER DEFAULT 0,
    subtopic_label TEXT,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User progress table
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    subtopic_id UUID REFERENCES subtopics(id) ON DELETE CASCADE,
    is_completed BOOLEAN DEFAULT FALSE,
    completion_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurnal ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_question_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies (users can only access their own data)
CREATE POLICY "Users can view their own data" ON users FOR SELECT USING (auth.uid()::text = id::text);
CREATE POLICY "Users can update their own data" ON users FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can view all courses" ON courses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create courses" ON courses FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can view subtopics" ON subtopics FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can view quiz" ON quiz FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can manage their quiz submissions" ON quiz_submissions FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage their journal entries" ON jurnal FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage their transcripts" ON transcript FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);
CREATE POLICY "Users can manage their ask question history" ON ask_question_history FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage their progress" ON user_progress FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage their feedback" ON feedback FOR ALL TO authenticated USING (auth.uid()::text = user_id::text);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);
CREATE INDEX IF NOT EXISTS idx_subtopics_course_id ON subtopics(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_course_id ON quiz(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_subtopic_id ON quiz(subtopic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_user_id ON quiz_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_jurnal_user_id ON jurnal(user_id);
CREATE INDEX IF NOT EXISTS idx_transcript_user_id ON transcript(user_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_user_id ON ask_question_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_course_id ON ask_question_history(course_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_created_at ON ask_question_history(created_at);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_user_course ON ask_question_history(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
