// src/app/api/admin/users/[id]/route.ts
// Admin Delete User — with auth guard and complete cascade delete

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'

// ─── Auth Helper ──────────────────────────────────────────────────────────────

function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

function requireAdmin(request: NextRequest) {
  const token =
    request.cookies.get('access_token')?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') return null
  return payload
}

// ─── Safe delete from a table ─────────────────────────────────────────────────

async function safeDeleteByUser(
  table: string,
  userIdColumn: string,
  userId: string
): Promise<{ deleted: boolean; error?: string }> {
  try {
    const { error } = await adminDb
      .from(table)
      .eq(userIdColumn, userId)
      .delete()

    if (error) {
      // Ignore "table not found" errors for optional tables
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.log(`[Admin Delete User] Table "${table}" does not exist, skipping.`)
        return { deleted: true }
      }
      console.warn(`[Admin Delete User] Warning deleting from ${table}:`, error.message)
      return { deleted: false, error: error.message }
    }
    console.log(`[Admin Delete User] Deleted from ${table} for user ${userId}`)
    return { deleted: true }
  } catch (err: any) {
    console.warn(`[Admin Delete User] Exception deleting from ${table}:`, err?.message)
    return { deleted: false, error: err?.message }
  }
}

// ─── DELETE Handler ───────────────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Auth guard
  const admin = requireAdmin(request)
  if (!admin) return unauthorized()

  try {
    const { id: userId } = await context.params
    console.log(`[Admin Delete User] Admin ${admin.email} attempting to delete user: ${userId}`)

    // Get user from database
    const { data: users, error: getUserError } = await adminDb
      .from('users')
      .select('id, email, role')
      .eq('id', userId)
      .limit(1)

    if (getUserError) {
      console.error('[Admin Delete User] Database error getting user:', getUserError)
      return NextResponse.json(
        { error: 'Database connection error', details: String(getUserError) },
        { status: 500 }
      )
    }

    if (!users || (users as any[]).length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = (users as any[])[0]
    console.log(`[Admin Delete User] Found user: ${user.email}, Role: ${user.role}`)

    // Prevent deleting admin users
    if ((user.role ?? '').toLowerCase() === 'admin') {
      return NextResponse.json(
        { error: 'Cannot delete admin users' },
        { status: 403 }
      )
    }

    // ── Complete cascade delete ──────────────────────────────────────────
    // Order matters: delete dependent records before parent records
    console.log(`[Admin Delete User] Starting complete cascade delete for: ${user.email}`)

    const deletionResults: Record<string, { deleted: boolean; error?: string }> = {}

    // 1. Discussion messages (depends on discussion_sessions)
    deletionResults['discussion_messages'] = await safeDeleteByUser('discussion_messages', 'user_id', userId)

    // 2. Discussion admin actions
    deletionResults['discussion_admin_actions'] = await safeDeleteByUser('discussion_admin_actions', 'admin_id', userId)

    // 3. Discussion sessions
    deletionResults['discussion_sessions'] = await safeDeleteByUser('discussion_sessions', 'user_id', userId)

    // 4. Quiz submissions
    deletionResults['quiz_submissions'] = await safeDeleteByUser('quiz_submissions', 'user_id', userId)

    // 5. Journal entries
    deletionResults['jurnal'] = await safeDeleteByUser('jurnal', 'user_id', userId)

    // 6. Transcripts
    deletionResults['transcript'] = await safeDeleteByUser('transcript', 'user_id', userId)

    // 7. Ask question history
    deletionResults['ask_question_history'] = await safeDeleteByUser('ask_question_history', 'user_id', userId)

    // 8. Challenge responses
    deletionResults['challenge_responses'] = await safeDeleteByUser('challenge_responses', 'user_id', userId)

    // 9. Feedback
    deletionResults['feedback'] = await safeDeleteByUser('feedback', 'user_id', userId)

    // 10. User progress
    deletionResults['user_progress'] = await safeDeleteByUser('user_progress', 'user_id', userId)

    // 11. Learning profiles
    deletionResults['learning_profiles'] = await safeDeleteByUser('learning_profiles', 'user_id', userId)

    // 12. Course generation activity
    deletionResults['course_generation_activity'] = await safeDeleteByUser('course_generation_activity', 'user_id', userId)

    // 13. API logs (user-specific)
    deletionResults['api_logs'] = await safeDeleteByUser('api_logs', 'user_id', userId)

    // 14. Research tables (optional, may not exist)
    deletionResults['prompt_classifications'] = await safeDeleteByUser('prompt_classifications', 'user_id', userId)
    deletionResults['cognitive_indicators'] = await safeDeleteByUser('cognitive_indicators', 'user_id', userId)
    deletionResults['prompt_revisions'] = await safeDeleteByUser('prompt_revisions', 'user_id', userId)
    deletionResults['learning_sessions'] = await safeDeleteByUser('learning_sessions', 'user_id', userId)
    deletionResults['research_artifacts'] = await safeDeleteByUser('research_artifacts', 'user_id', userId)
    deletionResults['triangulation_records'] = await safeDeleteByUser('triangulation_records', 'user_id', userId)

    // 15. Subtopics & Courses (courses.created_by)
    // Delete subtopics first (they reference courses)
    // Get course IDs for this user
    const { data: userCourses } = await adminDb
      .from('courses')
      .select('id')
      .eq('created_by', userId)

    if (userCourses && (userCourses as any[]).length > 0) {
      for (const course of userCourses as any[]) {
        await safeDeleteByUser('subtopics', 'course_id', course.id)
        await safeDeleteByUser('quiz', 'course_id', course.id)
        await safeDeleteByUser('subtopic_cache', 'course_id', course.id)
      }
    }

    // 16. Courses
    deletionResults['courses'] = await safeDeleteByUser('courses', 'created_by', userId)

    // 17. Finally delete the user record
    console.log(`[Admin Delete User] Deleting user record: ${userId}`)
    const { error: deleteUserError } = await adminDb
      .from('users')
      .eq('id', userId)
      .delete()

    if (deleteUserError) {
      console.error('[Admin Delete User] Error deleting user record:', deleteUserError)
      return NextResponse.json(
        { error: 'Failed to delete user record', details: String(deleteUserError) },
        { status: 500 }
      )
    }

    // Verify deletion
    const { data: verifyUser } = await adminDb
      .from('users')
      .select('id')
      .eq('id', userId)
      .limit(1)

    if (verifyUser && (verifyUser as any[]).length > 0) {
      console.error(`[Admin Delete User] User still exists after deletion: ${userId}`)
      return NextResponse.json(
        { error: 'User deletion may have failed - user still exists' },
        { status: 500 }
      )
    }

    console.log(`[Admin Delete User] Successfully deleted user ${user.email} and all associated data`)

    // Count failed deletions
    const failures = Object.entries(deletionResults)
      .filter(([, r]) => !r.deleted)
      .map(([table, r]) => `${table}: ${r.error}`)

    return NextResponse.json({
      success: true,
      message: `User ${user.email} and all associated data successfully deleted`,
      warnings: failures.length > 0 ? failures : undefined,
    })
  } catch (error: unknown) {
    console.error('[Admin Delete User] Unexpected error:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete user',
      },
      { status: 500 }
    )
  }
}
