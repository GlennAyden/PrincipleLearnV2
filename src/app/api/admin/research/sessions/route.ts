/**
 * API Route: Learning Sessions Management
 * For tracking longitudinal learning sessions per student
 * 
 * GET /api/admin/research/sessions - List all sessions with filters
 * POST /api/admin/research/sessions - Create new session
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type {
    LearningSession,
    CreateLearningSessionInput
} from '@/types/research';

const JWT_SECRET = process.env.JWT_SECRET!;

// Helper function to verify admin from cookie
function verifyAdminFromCookie(request: NextRequest): { userId: string; role: string } | null {
    const token = request.cookies.get('token')?.value;
    if (!token) return null;

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        if (payload.role?.toLowerCase() !== 'admin') return null;
        return payload;
    } catch {
        return null;
    }
}

// GET: List learning sessions with filters
export async function GET(request: NextRequest) {
    try {
        // Verify admin token from cookie
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('user_id');
        const courseId = searchParams.get('course_id');
        const sessionNumber = searchParams.get('session_number');
        const validOnly = searchParams.get('valid_only') === 'true';
        const limit = parseInt(searchParams.get('limit') || '100');

        // Build query
        let query = adminDb.from('learning_sessions').select('*');

        if (userId) {
            query = query.eq('user_id', userId);
        }
        if (courseId) {
            query = query.eq('course_id', courseId);
        }
        if (sessionNumber) {
            query = query.eq('session_number', parseInt(sessionNumber));
        }
        if (validOnly) {
            query = query.eq('is_valid_for_analysis', true);
        }

        query = query.order('created_at', { ascending: false }).limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching learning sessions:', error);
            return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data as LearningSession[],
            count: (data as LearningSession[])?.length || 0
        });

    } catch (error) {
        console.error('Error in GET /api/admin/research/sessions:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Create new learning session
export async function POST(request: NextRequest) {
    try {
        // Verify admin token from cookie
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

        // Create session
        const sessionData = {
            user_id: body.user_id,
            course_id: body.course_id,
            session_number: body.session_number,
            session_date: body.session_date,
            session_start: body.session_start || new Date().toISOString(),
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
