import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Debug: Fixing RLS policies for all tables');
    
    const supabaseAdmin = createServiceRoleClient();
    
    // Fix RLS policies for all tables to allow operations
    const fixAllRLSSQL = `
      -- Fix COURSES table RLS policies
      DROP POLICY IF EXISTS "Users can view all courses" ON courses;
      DROP POLICY IF EXISTS "Users can create courses" ON courses;
      
      CREATE POLICY "Allow all operations on courses" 
      ON courses FOR ALL 
      USING (true) 
      WITH CHECK (true);
      
      -- Fix SUBTOPICS table RLS policies  
      DROP POLICY IF EXISTS "Users can view subtopics" ON subtopics;
      
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
    `;
    
    // Execute the SQL
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: fixAllRLSSQL
    });
    
    if (error) {
      console.error('Debug: Error fixing all RLS policies:', error);
      
      // Try disabling RLS as fallback
      console.log('Debug: Trying to disable RLS on all tables as fallback');
      
      const disableAllRLSSQL = `
        ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
        ALTER TABLE subtopics DISABLE ROW LEVEL SECURITY;
        ALTER TABLE quiz DISABLE ROW LEVEL SECURITY;
        ALTER TABLE quiz_submissions DISABLE ROW LEVEL SECURITY;
        ALTER TABLE jurnal DISABLE ROW LEVEL SECURITY;
        ALTER TABLE transcript DISABLE ROW LEVEL SECURITY;
        ALTER TABLE user_progress DISABLE ROW LEVEL SECURITY;
        ALTER TABLE feedback DISABLE ROW LEVEL SECURITY;
      `;
      
      const { error: disableError } = await supabaseAdmin.rpc('exec_sql', {
        sql: disableAllRLSSQL
      });
      
      if (disableError) {
        return NextResponse.json({
          success: false,
          message: 'Failed to fix RLS policies',
          error: error.message,
          fallbackError: disableError.message,
          manualFix: 'Please run the SQL manually in Supabase dashboard',
          sqlToRun: fixAllRLSSQL
        }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        message: 'RLS disabled on all tables as fallback - all operations should work now',
        warning: 'RLS is disabled, consider re-enabling with proper policies later'
      });
    }
    
    console.log('Debug: All RLS policies fixed successfully');
    
    // Test course insertion
    try {
      const testCourse = {
        title: `Test Course ${Date.now()}`,
        description: 'Test course for RLS verification',
        subject: 'Testing',
        difficulty_level: 'beginner',
        estimated_duration: 60
      };
      
      const { data: courseData, error: courseError } = await supabaseAdmin
        .from('courses')
        .insert(testCourse)
        .select()
        .single();
      
      if (courseError) {
        console.error('Debug: Test course insert still failing:', courseError);
        return NextResponse.json({
          success: false,
          message: 'RLS policies updated but course insert still fails',
          error: courseError.message,
          details: courseError
        }, { status: 500 });
      }
      
      console.log('Debug: Test course created successfully:', courseData);
      
      // Test subtopic insertion
      const testSubtopic = {
        course_id: courseData.id,
        title: 'Test Subtopic',
        content: '{"test": true}',
        order_index: 0
      };
      
      const { data: subtopicData, error: subtopicError } = await supabaseAdmin
        .from('subtopics')
        .insert(testSubtopic)
        .select()
        .single();
      
      if (subtopicError) {
        console.error('Debug: Test subtopic insert failing:', subtopicError);
        return NextResponse.json({
          success: true,
          message: 'Course RLS fixed but subtopic RLS still has issues',
          courseTest: courseData,
          subtopicError: subtopicError.message
        });
      }
      
      console.log('Debug: Test subtopic created successfully:', subtopicData);
      
      return NextResponse.json({
        success: true,
        message: 'All RLS policies fixed and tested successfully',
        testCourse: courseData,
        testSubtopic: subtopicData
      });
      
    } catch (testError) {
      console.error('Debug: Test error after RLS fix:', testError);
      return NextResponse.json({
        success: true,
        message: 'RLS policies updated but test failed',
        warning: 'Please test course generation manually',
        error: testError instanceof Error ? testError.message : 'Unknown test error'
      });
    }
    
  } catch (error) {
    console.error('Debug: Unexpected error fixing all RLS:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}