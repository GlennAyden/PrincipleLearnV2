import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase'

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    console.log(`[Admin Delete User] Attempting to delete user: ${userId}`);
    
    // Create service role client for admin operations
    const adminSupabase = createServiceRoleClient();
    
    // Get user from database first
    console.log(`[Admin Delete User] Getting user info for: ${userId}`);
    const { data: users, error: getUserError } = await adminSupabase
      .from('users')
      .select('id, email, role')
      .eq('id', userId)
      .limit(1);
    
    if (getUserError) {
      console.error('[Admin Delete User] Database error getting user:', getUserError);
      return NextResponse.json(
        { error: 'Database connection error', details: getUserError.message },
        { status: 500 }
      );
    }
    
    if (!users || users.length === 0) {
      console.log(`[Admin Delete User] User not found: ${userId}`);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    const user = users[0];
    console.log(`[Admin Delete User] Found user: ${user.email}, Role: ${user.role}`);
    
    // Check if user is an admin
    if (user.role.toLowerCase() === 'admin') {
      console.log(`[Admin Delete User] Cannot delete admin user: ${user.email}`);
      return NextResponse.json(
        { error: "Cannot delete admin users" },
        { status: 403 }
      );
    }
    
    // Delete user and all associated data using service role client
    console.log(`[Admin Delete User] Starting deletion process for user: ${user.email}`);
    
    try {
      // Step 1: Delete associated data first (in case CASCADE doesn't work properly)
      console.log(`[Admin Delete User] Deleting associated courses for user: ${userId}`);
      const { error: coursesError } = await adminSupabase
        .from('courses')
        .delete()
        .eq('created_by', userId);
      
      if (coursesError) {
        console.warn(`[Admin Delete User] Warning deleting courses: ${coursesError.message}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted courses for user: ${userId}`);
      }
      
      // Step 2: Delete quiz submissions
      console.log(`[Admin Delete User] Deleting quiz submissions for user: ${userId}`);
      const { error: quizError } = await adminSupabase
        .from('quiz_submissions')
        .delete()
        .eq('user_id', userId);
      
      if (quizError) {
        console.warn(`[Admin Delete User] Warning deleting quiz submissions: ${quizError.message}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted quiz submissions for user: ${userId}`);
      }
      
      // Step 3: Delete journal entries
      console.log(`[Admin Delete User] Deleting journal entries for user: ${userId}`);
      const { error: journalError } = await adminSupabase
        .from('jurnal')
        .delete()
        .eq('user_id', userId);
      
      if (journalError) {
        console.warn(`[Admin Delete User] Warning deleting journal entries: ${journalError.message}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted journal entries for user: ${userId}`);
      }
      
      // Step 4: Delete transcripts
      console.log(`[Admin Delete User] Deleting transcripts for user: ${userId}`);
      const { error: transcriptError } = await adminSupabase
        .from('transcript')
        .delete()
        .eq('user_id', userId);
      
      if (transcriptError) {
        console.warn(`[Admin Delete User] Warning deleting transcripts: ${transcriptError.message}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted transcripts for user: ${userId}`);
      }
      
      // Step 5: Delete user progress
      console.log(`[Admin Delete User] Deleting user progress for user: ${userId}`);
      const { error: progressError } = await adminSupabase
        .from('user_progress')
        .delete()
        .eq('user_id', userId);
      
      if (progressError) {
        console.warn(`[Admin Delete User] Warning deleting user progress: ${progressError.message}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted user progress for user: ${userId}`);
      }
      
      // Step 6: Delete feedback
      console.log(`[Admin Delete User] Deleting feedback for user: ${userId}`);
      const { error: feedbackError } = await adminSupabase
        .from('feedback')
        .delete()
        .eq('user_id', userId);
      
      if (feedbackError) {
        console.warn(`[Admin Delete User] Warning deleting feedback: ${feedbackError.message}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted feedback for user: ${userId}`);
      }
      
      // Step 7: Finally delete the user
      console.log(`[Admin Delete User] Deleting user record: ${userId}`);
      const { error: deleteUserError } = await adminSupabase
        .from('users')
        .delete()
        .eq('id', userId);
      
      if (deleteUserError) {
        console.error('[Admin Delete User] Error deleting user:', deleteUserError);
        return NextResponse.json(
          { error: 'Failed to delete user from database', details: deleteUserError.message },
          { status: 500 }
        );
      }
      
      console.log(`[Admin Delete User] Successfully deleted user: ${user.email}`);
      
      // Verify deletion
      const { data: verifyUser, error: verifyError } = await adminSupabase
        .from('users')
        .select('id')
        .eq('id', userId)
        .limit(1);
      
      if (verifyError) {
        console.warn(`[Admin Delete User] Could not verify deletion: ${verifyError.message}`);
      } else if (verifyUser && verifyUser.length > 0) {
        console.error(`[Admin Delete User] User still exists after deletion: ${userId}`);
        return NextResponse.json(
          { error: 'User deletion may have failed - user still exists' },
          { status: 500 }
        );
      } else {
        console.log(`[Admin Delete User] Verified: User ${userId} has been completely deleted`);
      }
      
      return NextResponse.json({ 
        success: true,
        message: `User ${user.email} and all associated data successfully deleted`
      });
      
    } catch (deleteError) {
      console.error('[Admin Delete User] Error during deletion process:', deleteError);
      return NextResponse.json(
        { 
          error: 'Failed to delete user from database', 
          details: deleteError instanceof Error ? deleteError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('[Admin Delete User] Error in DELETE endpoint:', error);
    return NextResponse.json(
      { 
        error: error.message || "Failed to delete user",
        details: error.toString()
      },
      { status: 500 }
    );
  }
}