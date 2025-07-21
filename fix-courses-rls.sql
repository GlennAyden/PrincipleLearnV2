-- Fix RLS policies for courses and subtopics tables

-- Fix COURSES table RLS policies
DROP POLICY IF EXISTS "Users can view all courses" ON courses;
DROP POLICY IF EXISTS "Users can create courses" ON courses;

-- Create permissive policies for courses
CREATE POLICY "Allow all operations on courses" 
ON courses FOR ALL 
USING (true) 
WITH CHECK (true);

-- Fix SUBTOPICS table RLS policies  
DROP POLICY IF EXISTS "Users can view subtopics" ON subtopics;

-- Create permissive policies for subtopics
CREATE POLICY "Allow all operations on subtopics"
ON subtopics FOR ALL
USING (true)
WITH CHECK (true);

-- Fix QUIZ table RLS policies
DROP POLICY IF EXISTS "Users can view quiz" ON quiz;

CREATE POLICY "Allow all operations on quiz"
ON quiz FOR ALL  
USING (true)
WITH CHECK (true);

-- Fix QUIZ_SUBMISSIONS table RLS policies
DROP POLICY IF EXISTS "Users can manage their quiz submissions" ON quiz_submissions;

CREATE POLICY "Allow all operations on quiz_submissions"
ON quiz_submissions FOR ALL
USING (true)
WITH CHECK (true);

-- Fix JURNAL table RLS policies
DROP POLICY IF EXISTS "Users can manage their journal entries" ON jurnal;

CREATE POLICY "Allow all operations on jurnal"
ON jurnal FOR ALL
USING (true) 
WITH CHECK (true);

-- Fix TRANSCRIPT table RLS policies
DROP POLICY IF EXISTS "Users can manage their transcripts" ON transcript;

CREATE POLICY "Allow all operations on transcript"
ON transcript FOR ALL
USING (true)
WITH CHECK (true);

-- Fix USER_PROGRESS table RLS policies
DROP POLICY IF EXISTS "Users can manage their progress" ON user_progress;

CREATE POLICY "Allow all operations on user_progress"
ON user_progress FOR ALL
USING (true)
WITH CHECK (true);

-- Fix FEEDBACK table RLS policies
DROP POLICY IF EXISTS "Users can manage their feedback" ON feedback;

CREATE POLICY "Allow all operations on feedback"
ON feedback FOR ALL
USING (true)
WITH CHECK (true);

-- Keep RLS enabled but with permissive policies
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE subtopics ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE jurnal ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;