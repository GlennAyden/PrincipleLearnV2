// src/app/api/debug/test-delete/route.ts
// This is a test endpoint to debug deletion issues

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log(`[Debug Delete] Testing deletion for email: ${email}`);
    
    // Create service role client
    const adminSupabase = createServiceRoleClient();
    
    // Step 1: Find user by email
    const { data: users, error: getUserError } = await adminSupabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);
    
    if (getUserError) {
      return NextResponse.json({
        success: false,
        error: 'Error getting user',
        details: getUserError
      });
    }
    
    if (!users || users.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        email: email
      });
    }
    
    const user = users[0];
    console.log(`[Debug Delete] Found user:`, user);
    
    // Step 2: Check user's associated data
    const associatedData = {};
    
    // Check courses
    const { data: courses, error: coursesError } = await adminSupabase
      .from('courses')
      .select('id, title')
      .eq('created_by', user.id);
    
    associatedData.courses = courses || [];
    if (coursesError) associatedData.coursesError = coursesError;
    
    // Check quiz submissions
    const { data: quizSubmissions, error: quizError } = await adminSupabase
      .from('quiz_submissions')
      .select('id')
      .eq('user_id', user.id);
    
    associatedData.quizSubmissions = quizSubmissions || [];
    if (quizError) associatedData.quizError = quizError;
    
    // Check journal entries
    const { data: journals, error: journalError } = await adminSupabase
      .from('jurnal')
      .select('id')
      .eq('user_id', user.id);
    
    associatedData.journals = journals || [];
    if (journalError) associatedData.journalError = journalError;
    
    // Check transcripts
    const { data: transcripts, error: transcriptError } = await adminSupabase
      .from('transcript')
      .select('id')
      .eq('user_id', user.id);
    
    associatedData.transcripts = transcripts || [];
    if (transcriptError) associatedData.transcriptError = transcriptError;
    
    return NextResponse.json({
      success: true,
      user: user,
      associatedData: associatedData,
      message: 'User found, associated data retrieved'
    });
    
  } catch (error: any) {
    console.error('[Debug Delete] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { email } = await req.json();
    
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    console.log(`[Debug Delete] Attempting ACTUAL deletion for email: ${email}`);
    
    // Create service role client
    const adminSupabase = createServiceRoleClient();
    
    // Find user by email
    const { data: users, error: getUserError } = await adminSupabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);
    
    if (getUserError) {
      return NextResponse.json({
        success: false,
        error: 'Error getting user',
        details: getUserError
      });
    }
    
    if (!users || users.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        email: email
      });
    }
    
    const user = users[0];
    const userId = user.id;
    
    console.log(`[Debug Delete] Starting actual deletion for user: ${user.email} (${userId})`);
    
    const results = {};
    
    // Delete associated data step by step
    console.log(`[Debug Delete] Step 1: Deleting courses`);
    const { error: coursesError } = await adminSupabase
      .from('courses')
      .delete()
      .eq('created_by', userId);
    
    results.courses = { error: coursesError };
    
    console.log(`[Debug Delete] Step 2: Deleting quiz submissions`);
    const { error: quizError } = await adminSupabase
      .from('quiz_submissions')
      .delete()
      .eq('user_id', userId);
    
    results.quizSubmissions = { error: quizError };
    
    console.log(`[Debug Delete] Step 3: Deleting journal entries`);
    const { error: journalError } = await adminSupabase
      .from('jurnal')
      .delete()
      .eq('user_id', userId);
    
    results.journals = { error: journalError };
    
    console.log(`[Debug Delete] Step 4: Deleting transcripts`);
    const { error: transcriptError } = await adminSupabase
      .from('transcript')
      .delete()
      .eq('user_id', userId);
    
    results.transcripts = { error: transcriptError };
    
    console.log(`[Debug Delete] Step 5: Deleting user progress`);
    const { error: progressError } = await adminSupabase
      .from('user_progress')
      .delete()
      .eq('user_id', userId);
    
    results.userProgress = { error: progressError };
    
    console.log(`[Debug Delete] Step 6: Deleting feedback`);
    const { error: feedbackError } = await adminSupabase
      .from('feedback')
      .delete()
      .eq('user_id', userId);
    
    results.feedback = { error: feedbackError };
    
    console.log(`[Debug Delete] Step 7: Deleting user`);
    const { error: userDeleteError } = await adminSupabase
      .from('users')
      .delete()
      .eq('id', userId);
    
    results.user = { error: userDeleteError };
    
    // Verify deletion
    const { data: verifyUser, error: verifyError } = await adminSupabase
      .from('users')
      .select('id')
      .eq('id', userId);
    
    results.verification = {
      error: verifyError,
      userStillExists: verifyUser && verifyUser.length > 0,
      userData: verifyUser
    };
    
    return NextResponse.json({
      success: !userDeleteError,
      message: userDeleteError ? 'Deletion failed' : 'User deleted successfully',
      results: results,
      deletedUser: user.email
    });
    
  } catch (error: any) {
    console.error('[Debug Delete] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
}