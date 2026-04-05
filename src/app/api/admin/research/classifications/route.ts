/**
 * API Route: Prompt Classifications Management
 * GET /api/admin/research/classifications - List with filters + pagination
 * POST /api/admin/research/classifications - Create new classification
 * PUT /api/admin/research/classifications - Update existing classification
 * DELETE /api/admin/research/classifications - Delete classification
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type { PromptClassification, CreatePromptClassificationInput } from '@/types/research';
import { PROMPT_STAGE_SCORES } from '@/types/research';

const JWT_SECRET = process.env.JWT_SECRET!;

function validateUUID(id: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function verifyAdminFromCookie(request: NextRequest): { userId: string; role: string } | null {
    const token = request.cookies.get('access_token')?.value;
    if (!token) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        if (payload.role?.toLowerCase() !== 'admin') return null;
        return payload;
    } catch { return null; }
}

export async function GET(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('user_id');
        const courseId = searchParams.get('course_id');
        const sessionId = searchParams.get('learning_session_id');
        const promptStage = searchParams.get('prompt_stage');
        const promptSource = searchParams.get('prompt_source');
        const offset = parseInt(searchParams.get('offset') || '0');
        const limit = parseInt(searchParams.get('limit') || '100');

        if (userId && !validateUUID(userId)) return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 });
        if (courseId && !validateUUID(courseId)) return NextResponse.json({ error: 'Invalid course_id format' }, { status: 400 });

        let query = adminDb.from('prompt_classifications').select('*');
        if (userId) query = query.eq('user_id', userId);
        if (courseId) query = query.eq('course_id', courseId);
        if (sessionId) query = query.eq('learning_session_id', sessionId);
        if (promptStage) query = query.eq('prompt_stage', promptStage);
        if (promptSource) query = query.eq('prompt_source', promptSource);
        query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: 'Failed to fetch classifications' }, { status: 500 });

        // Total count
        let countQuery = adminDb.from('prompt_classifications').select('id');
        if (userId) countQuery = countQuery.eq('user_id', userId);
        if (courseId) countQuery = countQuery.eq('course_id', courseId);
        if (sessionId) countQuery = countQuery.eq('learning_session_id', sessionId);
        if (promptStage) countQuery = countQuery.eq('prompt_stage', promptStage);
        if (promptSource) countQuery = countQuery.eq('prompt_source', promptSource);
        const { data: countData } = await countQuery;
        const total = Array.isArray(countData) ? countData.length : 0;

        return NextResponse.json({ success: true, data: data as PromptClassification[], total, offset, limit });
    } catch (error) {
        console.error('Error in GET /api/admin/research/classifications:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body: CreatePromptClassificationInput = await request.json();

        if (!body.prompt_source || !body.prompt_id || !body.user_id || !body.course_id || !body.prompt_text || !body.prompt_stage || !body.classified_by) {
            return NextResponse.json({ error: 'Missing required fields: prompt_source, prompt_id, user_id, course_id, prompt_text, prompt_stage, classified_by' }, { status: 400 });
        }

        if (!['SCP', 'SRP', 'MQP', 'REFLECTIVE'].includes(body.prompt_stage)) {
            return NextResponse.json({ error: 'Invalid prompt_stage. Must be one of: SCP, SRP, MQP, REFLECTIVE' }, { status: 400 });
        }

        const { data: existing } = await adminDb.from('prompt_classifications').select('id').eq('prompt_id', body.prompt_id).eq('classified_by', body.classified_by).single();
        if (existing) return NextResponse.json({ error: 'Classification already exists for this prompt by this classifier' }, { status: 409 });

        const promptStageScore = PROMPT_STAGE_SCORES[body.prompt_stage];
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

        const { data, error } = await adminDb.from('prompt_classifications').insert(classificationData);
        if (error) return NextResponse.json({ error: 'Failed to create classification' }, { status: 500 });

        if (body.learning_session_id) await updateSessionPromptCount(body.learning_session_id);

        return NextResponse.json({ success: true, data: data as PromptClassification, message: 'Prompt classification created successfully' }, { status: 201 });
    } catch (error) {
        console.error('Error in POST /api/admin/research/classifications:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { id, ...updateFields } = body;

        if (!id) return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
        if (!validateUUID(id)) return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });

        const { data: existing } = await adminDb.from('prompt_classifications').select('id, learning_session_id').eq('id', id).single();
        if (!existing) return NextResponse.json({ error: 'Classification not found' }, { status: 404 });

        // If prompt_stage changed, recalculate score
        if (updateFields.prompt_stage) {
            if (!['SCP', 'SRP', 'MQP', 'REFLECTIVE'].includes(updateFields.prompt_stage)) {
                return NextResponse.json({ error: 'Invalid prompt_stage' }, { status: 400 });
            }
            updateFields.prompt_stage_score = PROMPT_STAGE_SCORES[updateFields.prompt_stage as keyof typeof PROMPT_STAGE_SCORES];
        }

        // Stringify micro_markers if array
        if (Array.isArray(updateFields.micro_markers)) {
            updateFields.micro_markers = JSON.stringify(updateFields.micro_markers);
        }

        const allowedFields = [
            'prompt_source', 'prompt_id', 'learning_session_id', 'user_id', 'course_id',
            'prompt_text', 'prompt_sequence', 'prompt_stage', 'prompt_stage_score',
            'micro_markers', 'primary_marker', 'classified_by', 'classification_method',
            'confidence_score', 'classification_evidence', 'researcher_notes', 'agreement_status'
        ];

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const field of allowedFields) {
            if (updateFields[field] !== undefined) updateData[field] = updateFields[field];
        }

        const { data, error } = await adminDb.from('prompt_classifications').eq('id', id).update(updateData);
        if (error) return NextResponse.json({ error: 'Failed to update classification' }, { status: 500 });

        return NextResponse.json({ success: true, data: data as PromptClassification, message: 'Classification updated successfully' });
    } catch (error) {
        console.error('Error in PUT /api/admin/research/classifications:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
        if (!validateUUID(id)) return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });

        const { data: existing } = await adminDb.from('prompt_classifications').select('id, learning_session_id').eq('id', id).single();
        if (!existing) return NextResponse.json({ error: 'Classification not found' }, { status: 404 });

        // Check for dependent cognitive_indicators
        const { data: deps } = await adminDb.from('cognitive_indicators').select('id').eq('prompt_classification_id', id);
        if (deps && Array.isArray(deps) && deps.length > 0) {
            return NextResponse.json({ error: `Cannot delete: ${deps.length} indicator(s) depend on it. Delete indicators first.` }, { status: 409 });
        }

        const { error } = await adminDb.from('prompt_classifications').eq('id', id).delete();
        if (error) return NextResponse.json({ error: 'Failed to delete classification' }, { status: 500 });

        // Update session prompt count
        const sessionId = (existing as Record<string, unknown>)?.learning_session_id as string;
        if (sessionId) await updateSessionPromptCount(sessionId);

        return NextResponse.json({ success: true, message: 'Classification deleted successfully' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/research/classifications:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function updateSessionPromptCount(sessionId: string) {
    try {
        const { data: classifications } = await adminDb.from('prompt_classifications').select('id').eq('learning_session_id', sessionId);
        const totalPrompts = Array.isArray(classifications) ? classifications.length : 0;
        await adminDb.from('learning_sessions').eq('id', sessionId).update({ total_prompts: totalPrompts });
    } catch (error) {
        console.error('Error updating session prompt count:', error);
    }
}
