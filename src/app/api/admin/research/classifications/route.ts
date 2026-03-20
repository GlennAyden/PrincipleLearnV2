/**
 * API Route: Prompt Classifications Management
 * For classifying prompts into stages (SCP, SRP, MQP, REFLECTIVE)
 * 
 * GET /api/admin/research/classifications - List classifications with filters
 * POST /api/admin/research/classifications - Create new classification
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type {
    PromptClassification,
    CreatePromptClassificationInput
} from '@/types/research';
import { PROMPT_STAGE_SCORES } from '@/types/research';

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

// GET: List prompt classifications with filters
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
        const sessionId = searchParams.get('learning_session_id');
        const promptStage = searchParams.get('prompt_stage');
        const promptSource = searchParams.get('prompt_source');
        const limit = parseInt(searchParams.get('limit') || '100');

        // Build query
        let query = adminDb.from('prompt_classifications').select('*');

        if (userId) {
            query = query.eq('user_id', userId);
        }
        if (courseId) {
            query = query.eq('course_id', courseId);
        }
        if (sessionId) {
            query = query.eq('learning_session_id', sessionId);
        }
        if (promptStage) {
            query = query.eq('prompt_stage', promptStage);
        }
        if (promptSource) {
            query = query.eq('prompt_source', promptSource);
        }

        query = query.order('created_at', { ascending: false }).limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching prompt classifications:', error);
            return NextResponse.json({ error: 'Failed to fetch classifications' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data as PromptClassification[],
            count: (data as PromptClassification[])?.length || 0
        });

    } catch (error) {
        console.error('Error in GET /api/admin/research/classifications:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Create new prompt classification
export async function POST(request: NextRequest) {
    try {
        // Verify admin token from cookie
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: CreatePromptClassificationInput = await request.json();

        // Validate required fields
        if (!body.prompt_source || !body.prompt_id || !body.user_id ||
            !body.course_id || !body.prompt_text || !body.prompt_stage || !body.classified_by) {
            return NextResponse.json({
                error: 'Missing required fields: prompt_source, prompt_id, user_id, course_id, prompt_text, prompt_stage, classified_by'
            }, { status: 400 });
        }

        // Validate prompt_stage
        if (!['SCP', 'SRP', 'MQP', 'REFLECTIVE'].includes(body.prompt_stage)) {
            return NextResponse.json({
                error: 'Invalid prompt_stage. Must be one of: SCP, SRP, MQP, REFLECTIVE'
            }, { status: 400 });
        }

        // Check if classification already exists for this prompt
        const { data: existing } = await adminDb
            .from('prompt_classifications')
            .select('id')
            .eq('prompt_id', body.prompt_id)
            .eq('classified_by', body.classified_by)
            .single();

        if (existing) {
            return NextResponse.json({
                error: 'Classification already exists for this prompt by this classifier'
            }, { status: 409 });
        }

        // Calculate prompt stage score
        const promptStageScore = PROMPT_STAGE_SCORES[body.prompt_stage];

        // Create classification
        const classificationData = {
            prompt_source: body.prompt_source,
            prompt_id: body.prompt_id,
            learning_session_id: body.learning_session_id || null,
            user_id: body.user_id,
            course_id: body.course_id,
            prompt_text: body.prompt_text,
            prompt_sequence: body.prompt_sequence || null,
            prompt_stage: body.prompt_stage,
            prompt_stage_score: promptStageScore,
            micro_markers: body.micro_markers ? JSON.stringify(body.micro_markers) : null,
            primary_marker: body.primary_marker || null,
            classified_by: body.classified_by,
            classification_method: body.classification_method || 'manual_coding',
            confidence_score: body.confidence_score || null,
            classification_evidence: body.classification_evidence || null,
            researcher_notes: body.researcher_notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await adminDb
            .from('prompt_classifications')
            .insert(classificationData);

        if (error) {
            console.error('Error creating prompt classification:', error);
            return NextResponse.json({ error: 'Failed to create classification' }, { status: 500 });
        }

        // Update learning session metrics if session_id provided
        if (body.learning_session_id) {
            await updateSessionPromptCount(body.learning_session_id);
        }

        return NextResponse.json({
            success: true,
            data: data as PromptClassification,
            message: 'Prompt classification created successfully'
        }, { status: 201 });

    } catch (error) {
        console.error('Error in POST /api/admin/research/classifications:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Helper function to update session prompt count
async function updateSessionPromptCount(sessionId: string) {
    try {
        // Get current count
        const { data: classifications } = await adminDb
            .from('prompt_classifications')
            .select('id')
            .eq('learning_session_id', sessionId);

        const totalPrompts = classifications?.length || 0;

        // Update session - build query with filter first, then update
        const updateQuery = adminDb
            .from('learning_sessions')
            .eq('id', sessionId);

        await updateQuery.update({
            total_prompts: totalPrompts,
            updated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error updating session prompt count:', error);
    }
}
