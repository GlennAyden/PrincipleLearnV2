/**
 * API Route: Cognitive Indicators Management
 * GET /api/admin/research/indicators - List with filters + pagination
 * POST /api/admin/research/indicators - Create new indicator assessment
 * PUT /api/admin/research/indicators - Update existing indicator
 * DELETE /api/admin/research/indicators - Delete indicator
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type { CognitiveIndicators, CreateCognitiveIndicatorsInput } from '@/types/research';
import { calculateCTScore, calculateCThScore } from '@/types/research';

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

function validateIndicatorScores(scores: (number | undefined)[]): boolean {
    return scores.filter(v => v !== undefined).every(v => v !== undefined && v >= 0 && v <= 2);
}

export async function GET(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('user_id');
        const classificationId = searchParams.get('prompt_classification_id');
        const minCtScore = searchParams.get('min_ct_score');
        const minCthScore = searchParams.get('min_cth_score');
        const offset = parseInt(searchParams.get('offset') || '0');
        const limit = parseInt(searchParams.get('limit') || '100');

        if (userId && !validateUUID(userId)) return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 });

        let query = adminDb.from('cognitive_indicators').select('*');
        if (userId) query = query.eq('user_id', userId);
        if (classificationId) query = query.eq('prompt_classification_id', classificationId);
        query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });

        // Post-query filtering for scores
        let filteredData = data as CognitiveIndicators[];
        if (minCtScore) filteredData = filteredData.filter(d => d.ct_total_score >= parseInt(minCtScore));
        if (minCthScore) filteredData = filteredData.filter(d => d.cth_total_score >= parseInt(minCthScore));

        // Total count
        let countQuery = adminDb.from('cognitive_indicators').select('id');
        if (userId) countQuery = countQuery.eq('user_id', userId);
        if (classificationId) countQuery = countQuery.eq('prompt_classification_id', classificationId);
        const { data: countData } = await countQuery;
        const total = Array.isArray(countData) ? countData.length : 0;

        return NextResponse.json({ success: true, data: filteredData, total, offset, limit });
    } catch (error) {
        console.error('Error in GET /api/admin/research/indicators:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body: CreateCognitiveIndicatorsInput = await request.json();

        if (!body.prompt_classification_id || !body.prompt_id || !body.user_id || !body.assessed_by) {
            return NextResponse.json({ error: 'Missing required fields: prompt_classification_id, prompt_id, user_id, assessed_by' }, { status: 400 });
        }

        const allIndicators = [
            body.ct_decomposition, body.ct_pattern_recognition, body.ct_abstraction,
            body.ct_algorithm_design, body.ct_evaluation_debugging, body.ct_generalization,
            body.cth_interpretation, body.cth_analysis, body.cth_evaluation,
            body.cth_inference, body.cth_explanation, body.cth_self_regulation
        ];

        if (!validateIndicatorScores(allIndicators)) {
            return NextResponse.json({ error: 'Invalid indicator values. All must be between 0 and 2' }, { status: 400 });
        }

        const { data: existing } = await adminDb.from('cognitive_indicators').select('id')
            .eq('prompt_classification_id', body.prompt_classification_id).eq('assessed_by', body.assessed_by).single();
        if (existing) return NextResponse.json({ error: 'Assessment already exists for this classification by this assessor' }, { status: 409 });

        // Note: ct_total_score and cth_total_score are GENERATED columns - don't include them
        const indicatorData = {
            prompt_classification_id: body.prompt_classification_id,
            prompt_id: body.prompt_id,
            user_id: body.user_id,
            ct_decomposition: body.ct_decomposition || 0,
            ct_pattern_recognition: body.ct_pattern_recognition || 0,
            ct_abstraction: body.ct_abstraction || 0,
            ct_algorithm_design: body.ct_algorithm_design || 0,
            ct_evaluation_debugging: body.ct_evaluation_debugging || 0,
            ct_generalization: body.ct_generalization || 0,
            cth_interpretation: body.cth_interpretation || 0,
            cth_analysis: body.cth_analysis || 0,
            cth_evaluation: body.cth_evaluation || 0,
            cth_inference: body.cth_inference || 0,
            cth_explanation: body.cth_explanation || 0,
            cth_self_regulation: body.cth_self_regulation || 0,
            cognitive_depth_level: body.cognitive_depth_level || undefined,
            evidence_text: body.evidence_text || undefined,
            indicator_notes: body.indicator_notes || undefined,
            assessed_by: body.assessed_by,
            assessment_method: body.assessment_method || 'manual_coding',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await adminDb.from('cognitive_indicators').insert(indicatorData);
        if (error) return NextResponse.json({ error: 'Failed to create indicators' }, { status: 500 });

        const ctTotal = calculateCTScore(indicatorData);
        const cthTotal = calculateCThScore(indicatorData);

        return NextResponse.json({
            success: true, data: data as CognitiveIndicators,
            computed: { ct_total_score: ctTotal, cth_total_score: cthTotal },
            message: 'Cognitive indicators created successfully'
        }, { status: 201 });
    } catch (error) {
        console.error('Error in POST /api/admin/research/indicators:', error);
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

        const { data: existing } = await adminDb.from('cognitive_indicators').select('id').eq('id', id).single();
        if (!existing) return NextResponse.json({ error: 'Indicator not found' }, { status: 404 });

        // Validate indicator scores if provided
        const scoreFields = [
            updateFields.ct_decomposition, updateFields.ct_pattern_recognition, updateFields.ct_abstraction,
            updateFields.ct_algorithm_design, updateFields.ct_evaluation_debugging, updateFields.ct_generalization,
            updateFields.cth_interpretation, updateFields.cth_analysis, updateFields.cth_evaluation,
            updateFields.cth_inference, updateFields.cth_explanation, updateFields.cth_self_regulation
        ];
        if (!validateIndicatorScores(scoreFields)) {
            return NextResponse.json({ error: 'Invalid indicator values. All must be between 0 and 2' }, { status: 400 });
        }

        // Don't update generated columns (ct_total_score, cth_total_score)
        const allowedFields = [
            'prompt_classification_id', 'prompt_id', 'user_id',
            'ct_decomposition', 'ct_pattern_recognition', 'ct_abstraction',
            'ct_algorithm_design', 'ct_evaluation_debugging', 'ct_generalization',
            'cth_interpretation', 'cth_analysis', 'cth_evaluation',
            'cth_inference', 'cth_explanation', 'cth_self_regulation',
            'cognitive_depth_level', 'evidence_text', 'indicator_notes',
            'assessed_by', 'assessment_method', 'agreement_status'
        ];

        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const field of allowedFields) {
            if (updateFields[field] !== undefined) updateData[field] = updateFields[field];
        }

        const { data, error } = await adminDb.from('cognitive_indicators').eq('id', id).update(updateData);
        if (error) return NextResponse.json({ error: 'Failed to update indicator' }, { status: 500 });

        return NextResponse.json({ success: true, data: data as CognitiveIndicators, message: 'Indicator updated successfully' });
    } catch (error) {
        console.error('Error in PUT /api/admin/research/indicators:', error);
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

        const { data: existing } = await adminDb.from('cognitive_indicators').select('id').eq('id', id).single();
        if (!existing) return NextResponse.json({ error: 'Indicator not found' }, { status: 404 });

        const { error } = await adminDb.from('cognitive_indicators').eq('id', id).delete();
        if (error) return NextResponse.json({ error: 'Failed to delete indicator' }, { status: 500 });

        return NextResponse.json({ success: true, message: 'Indicator deleted successfully' });
    } catch (error) {
        console.error('Error in DELETE /api/admin/research/indicators:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
