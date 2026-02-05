import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'

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

    // Get user from database first
    console.log(`[Admin Delete User] Getting user info for: ${userId}`);
    const { data: users, error: getUserError } = await adminDb
      .from('users')
      .select('id, email, role')
      .eq('id', userId)
      .limit(1);

    if (getUserError) {
      console.error('[Admin Delete User] Database error getting user:', getUserError);
      return NextResponse.json(
        { error: 'Database connection error', details: String(getUserError) },
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

    const user = users[0] as User;
    console.log(`[Admin Delete User] Found user: ${user.email}, Role: ${user.role}`);

    // Check if user is an admin
    if (user.role.toLowerCase() === 'admin') {
      console.log(`[Admin Delete User] Cannot delete admin user: ${user.email}`);
      return NextResponse.json(
        { error: "Cannot delete admin users" },
        { status: 403 }
      );
    }

    // Delete user and all associated data
    console.log(`[Admin Delete User] Starting deletion process for user: ${user.email}`);

    try {
      // Step 1: Delete associated courses
      console.log(`[Admin Delete User] Deleting associated courses for user: ${userId}`);
      const { error: coursesError } = await adminDb
        .from('courses')
        .eq('created_by', userId)
        .delete();

      if (coursesError) {
        console.warn(`[Admin Delete User] Warning deleting courses: ${String(coursesError)}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted courses for user: ${userId}`);
      }

      // Step 2: Delete quiz submissions
      console.log(`[Admin Delete User] Deleting quiz submissions for user: ${userId}`);
      const { error: quizError } = await adminDb
        .from('quiz_submissions')
        .eq('user_id', userId)
        .delete();

      if (quizError) {
        console.warn(`[Admin Delete User] Warning deleting quiz submissions: ${String(quizError)}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted quiz submissions for user: ${userId}`);
      }

      // Step 3: Delete journal entries
      console.log(`[Admin Delete User] Deleting journal entries for user: ${userId}`);
      const { error: journalError } = await adminDb
        .from('jurnal')
        .eq('user_id', userId)
        .delete();

      if (journalError) {
        console.warn(`[Admin Delete User] Warning deleting journal entries: ${String(journalError)}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted journal entries for user: ${userId}`);
      }

      // Step 4: Delete user progress
      console.log(`[Admin Delete User] Deleting user progress for user: ${userId}`);
      const { error: progressError } = await adminDb
        .from('user_progress')
        .eq('user_id', userId)
        .delete();

      if (progressError) {
        console.warn(`[Admin Delete User] Warning deleting user progress: ${String(progressError)}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted user progress for user: ${userId}`);
      }

      // Step 5: Delete feedback
      console.log(`[Admin Delete User] Deleting feedback for user: ${userId}`);
      const { error: feedbackError } = await adminDb
        .from('feedback')
        .eq('user_id', userId)
        .delete();

      if (feedbackError) {
        console.warn(`[Admin Delete User] Warning deleting feedback: ${String(feedbackError)}`);
      } else {
        console.log(`[Admin Delete User] Successfully deleted feedback for user: ${userId}`);
      }

      // Step 6: Finally delete the user
      console.log(`[Admin Delete User] Deleting user record: ${userId}`);
      const { error: deleteUserError } = await adminDb
        .from('users')
        .eq('id', userId)
        .delete();

      if (deleteUserError) {
        console.error('[Admin Delete User] Error deleting user:', deleteUserError);
        return NextResponse.json(
          { error: 'Failed to delete user from database', details: String(deleteUserError) },
          { status: 500 }
        );
      }

      console.log(`[Admin Delete User] Successfully deleted user: ${user.email}`);

      // Verify deletion
      const { data: verifyUser, error: verifyError } = await adminDb
        .from('users')
        .select('id')
        .eq('id', userId)
        .limit(1);

      if (verifyError) {
        console.warn(`[Admin Delete User] Could not verify deletion: ${String(verifyError)}`);
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

  } catch (error: unknown) {
    console.error('[Admin Delete User] Error in DELETE endpoint:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete user",
        details: String(error)
      },
      { status: 500 }
    );
  }
}