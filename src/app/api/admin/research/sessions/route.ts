/**
 * API Route: Learning Sessions Management
 * For tracking longitudinal learning sessions per student
 * 
 * GET /api/admin/research/sessions - List all sessions with filters + pagination
 * POST /api/admin/research/sessions - Create new session
 * PUT /api/admin/research/sessions - Update existing session
 * DELETE /api/admin/research/sessions - Delete session
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyCsrfToken } from '@/lib/admin-auth';
import jwt from 'jsonwebtoken';
import type {
    LearningSession,
    CreateLearningSessionInput
} from '@/types/research';

const JWT_SECRET = process.env.JWT_SECRET!;

// UUID validation helper
function validateUUID(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// Helper function to verify admin from cookie
function verifyAdminFromCookie(request: NextRequest): { userId: string; role: string } | null {
    const token = request.cookies.get('access_token')?.value;
    if (!token) return null;

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        if (payload.role?.toLowerCase() !== 'admin') return null;
        return payload;
    } catch {
        return null;
    }
}

// GET: List learning sessions with filters and server-side pagination
export async function GET(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('user_id');
        const courseId = searchParams.get('course_id');
        const sessionNumber = searchParams.get('session_number');
        const validOnly = searchParams.get('valid_only') === 'true';
        const status = searchParams.get('status');
        const offset = parseInt(searchParams.get('offset') || '0');
        const limit = parseInt(searchParams.get('limit') || '100');

        // Validate UUID params if provided
        if (userId && !validateUUID(userId)) {
            return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 });
        }
        if (courseId && !validateUUID(courseId)) {
            return NextResponse.json({ error: 'Invalid course_id format' }, { status: 400 });
        }

        // Build query for data
        let query = adminDb.from('learning_sessions').select('*');

        if (userId) query = query.eq('user_id', userId);
        if (courseId) query = query.eq('course_id', courseId);
        if (sessionNumber) query = query.eq('session_number', parseInt(sessionNumber));
        if (validOnly) query = query.eq('is_valid_for_analysis', true);
        if (status) query = query.eq('status', status);

        query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching learning sessions:', error);
            return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
        }

        // Get total count with same filters
        let countQuery = adminDb.from('learning_sessions').select('id');
        if (userId) countQuery = countQuery.eq('user_id', userId);
        if (courseId) countQuery = countQuery.eq('course_id', courseId);
        if (sessionNumber) countQuery = countQuery.eq('session_number', parseInt(sessionNumber));
        if (validOnly) countQuery = countQuery.eq('is_valid_for_analysis', true);
        if (status) countQuery = countQuery.eq('status', status);

        const { data: countData } = await countQuery;
        const total = Array.isArray(countData) ? countData.length : 0;

        return NextResponse.json({
            success: true,
            data: data as LearningSession[],
            total,
            offset,
            limit
        });

    } catch (error) {
        console.error('Error in GET /api/admin/research/sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Create new learning session
export async function POST(request: NextRequest) {
    try {
        const csrfError = verifyCsrfToken(request);
        if (csrfError) return csrfError;

        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: CreateLearningSessionInput = await request.json();

        // Validate required fields
        if (!body.user_id || !body.course_id || !body.session_number || !body.session_date) {
            return NextResponse.json({
                error: 'Missing required fields: user_id, course_id, session_number, session_date'
            }, { status: 400 });
        }

        // Validate UUID format
        if (!validateUUID(body.user_id)) {
            return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 });
        }
        if (!validateUUID(body.course_id)) {
            return NextResponse.json({ error: 'Invalid course_id format' }, { status: 400 });
        }

        // Check if session already exists
        const { data: existing } = await adminDb
            .from('learning_sessions')
            .select('id')
            .eq('user_id', body.user_id)
            .eq('course_id', body.course_id)
            .eq('session_number', body.session_number)
            .single();

        if (existing) {
            return NextResponse.json({
                error: 'Session already exists for this user, course, and session number'
            }, { status: 409 });
        }

        // Validate status if provided
        if (body.status && !['active', 'completed', 'paused'].includes(body.status)) {
            return NextResponse.json({
                error: 'Invalid status. Must be one of: active, completed, paused'
            }, { status: 400 });
        }

        // Create session with new fields
        const sessionData = {
            user_id: body.user_id,
            course_id: body.course_id,
            session_number: body.session_number,
            session_date: body.session_date,
            session_start: body.session_start || new Date().toISOString(),
            topic_focus: body.topic_focus || null,
            duration_minutes: body.duration_minutes || null,
            status: body.status || 'active',
            total_prompts: 0,
            total_revisions: 0,
            is_valid_for_analysis: true,
            researcher_notes: body.researcher_notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await adminDb
            .from('learning_sessions')
            .insert(sessionData);

        if (error) {
            console.error('Error creating learning session:', error);
            return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data as LearningSession,
            message: 'Learning session created successfully'
        }, { status: 201 });

    } catch (error) {
        console.error('Error in POST /api/admin/research/sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// PUT: Update existing learning session
export async function PUT(request: NextRequest) {
    try {
        const csrfError = verifyCsrfToken(request);
        if (csrfError) return csrfError;

        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { id, ...updateFields } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
        }

        if (!validateUUID(id)) {
            return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
        }

        // Validate status if provided
        if (updateFields.status && !['active', 'completed', 'paused'].includes(updateFields.status)) {
            return NextResponse.json({
                error: 'Invalid status. Must be one of: active, completed, paused'
            }, { status: 400 });
        }

        // Check if session exists
        const { data: existing } = await adminDb
            .from('learning_sessions')
            .select('id')
            .eq('id', id)
            .single();

        if (!existing) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Build update data - only include allowed fields
        const allowedFields = [
            'user_id', 'course_id', 'session_number', 'session_date',
            'session_start', 'session_end', 'total_prompts', 'total_revisions',
            'dominant_stage', 'dominant_stage_score', 'avg_cognitive_depth',
            'avg_ct_score', 'avg_cth_score', 'stage_transition', 'transition_status',
            'topic_focus', 'duration_minutes', 'status',
            'is_valid_for_analysis', 'validity_note', 'researcher_notes'
        ];

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const field of allowedFields) {
            if (updateFields[field] !== undefined) {
                updateData[field] = updateFields[field];
            }
        }

        const updateQuery = adminDb
            .from('learning_sessions')
            .eq('id', id);

        const { data, error } = await updateQuery.update(updateData);

        if (error) {
            console.error('Error updating learning session:', error);
            return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data as LearningSession,
            message: 'Learning session updated successfully'
        });

    } catch (error) {
        console.error('Error in PUT /api/admin/research/sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE: Delete a learning session
export async function DELETE(request: NextRequest) {
    try {
        const csrfError = verifyCsrfToken(request);
        if (csrfError) return csrfError;

        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
        }

        if (!validateUUID(id)) {
            return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
        }

        // Check if session exists
        const { data: existing } = await adminDb
            .from('learning_sessions')
            .select('id')
            .eq('id', id)
            .single();

        if (!existing) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Check for dependent records
        const { data: dependentClassifications } = await adminDb
            .from('prompt_classifications')
            .select('id')
            .eq('learning_session_id', id);

        if (dependentClassifications && Array.isArray(dependentClassifications) && dependentClassifications.length > 0) {
            return NextResponse.json({
                error: `Cannot delete session: ${dependentClassifications.length} classification(s) depend on it. Delete classifications first.`
            }, { status: 409 });
        }

        // Delete session
        const deleteQuery = adminDb
            .from('learning_sessions')
            .eq('id', id);

        const { error } = await deleteQuery.delete();

        if (error) {
            console.error('Error deleting learning session:', error);
            return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Learning session deleted successfully'
        });

    } catch (error) {
        console.error('Error in DELETE /api/admin/research/sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
