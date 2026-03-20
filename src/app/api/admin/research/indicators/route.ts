/**
 * API Route: Cognitive Indicators Management
 * For tracking CT and Critical Thinking indicators per prompt
 * 
 * GET /api/admin/research/indicators - List indicators with filters
 * POST /api/admin/research/indicators - Create new indicator assessment
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type {
    CognitiveIndicators,
    CreateCognitiveIndicatorsInput
} from '@/types/research';
import { calculateCTScore, calculateCThScore } from '@/types/research';

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

// GET: List cognitive indicators with filters
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
        const classificationId = searchParams.get('prompt_classification_id');
        const minCtScore = searchParams.get('min_ct_score');
        const minCthScore = searchParams.get('min_cth_score');
        const limit = parseInt(searchParams.get('limit') || '100');

        // Build query
        let query = adminDb.from('cognitive_indicators').select('*');

        if (userId) {
            query = query.eq('user_id', userId);
        }
        if (classificationId) {
            query = query.eq('prompt_classification_id', classificationId);
        }

        query = query.order('created_at', { ascending: false }).limit(limit);

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching cognitive indicators:', error);
            return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });
        }

        // Filter by scores if specified (post-query filtering)
        let filteredData = data as CognitiveIndicators[];
        if (minCtScore) {
            filteredData = filteredData.filter(d => d.ct_total_score >= parseInt(minCtScore));
        }
        if (minCthScore) {
            filteredData = filteredData.filter(d => d.cth_total_score >= parseInt(minCthScore));
        }

        return NextResponse.json({
            success: true,
            data: filteredData,
            count: filteredData?.length || 0
        });

    } catch (error) {
        console.error('Error in GET /api/admin/research/indicators:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST: Create new cognitive indicator assessment
export async function POST(request: NextRequest) {
    try {
        // Verify admin token from cookie
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: CreateCognitiveIndicatorsInput = await request.json();

        // Validate required fields
        if (!body.prompt_classification_id || !body.prompt_id || !body.user_id || !body.assessed_by) {
            return NextResponse.json({
                error: 'Missing required fields: prompt_classification_id, prompt_id, user_id, assessed_by'
            }, { status: 400 });
        }

        // Validate indicator values (0-2 scale)
        const ctIndicators = [
            body.ct_decomposition,
            body.ct_pattern_recognition,
            body.ct_abstraction,
            body.ct_algorithm_design,
            body.ct_evaluation_debugging,
            body.ct_generalization
        ];

        const cthIndicators = [
            body.cth_interpretation,
            body.cth_analysis,
            body.cth_evaluation,
            body.cth_inference,
            body.cth_explanation,
            body.cth_self_regulation
        ];

        const allIndicators = [...ctIndicators, ...cthIndicators].filter(v => v !== undefined);
        const invalidIndicators = allIndicators.filter(v => v !== undefined && (v < 0 || v > 2));

        if (invalidIndicators.length > 0) {
            return NextResponse.json({
                error: 'Invalid indicator values. All indicators must be between 0 and 2'
            }, { status: 400 });
        }

        // Check if assessment already exists for this classification by this assessor
        const { data: existing } = await adminDb
            .from('cognitive_indicators')
            .select('id')
            .eq('prompt_classification_id', body.prompt_classification_id)
            .eq('assessed_by', body.assessed_by)
            .single();

        if (existing) {
            return NextResponse.json({
                error: 'Assessment already exists for this classification by this assessor'
            }, { status: 409 });
        }

        // Calculate total scores
        const ctTotalScore = calculateCTScore({
            ct_decomposition: body.ct_decomposition || 0,
            ct_pattern_recognition: body.ct_pattern_recognition || 0,
            ct_abstraction: body.ct_abstraction || 0,
            ct_algorithm_design: body.ct_algorithm_design || 0,
            ct_evaluation_debugging: body.ct_evaluation_debugging || 0,
            ct_generalization: body.ct_generalization || 0
        });

        const cthTotalScore = calculateCThScore({
            cth_interpretation: body.cth_interpretation || 0,
            cth_analysis: body.cth_analysis || 0,
            cth_evaluation: body.cth_evaluation || 0,
            cth_inference: body.cth_inference || 0,
            cth_explanation: body.cth_explanation || 0,
            cth_self_regulation: body.cth_self_regulation || 0
        });

        // Create indicator assessment
        const indicatorData = {
            prompt_classification_id: body.prompt_classification_id,
            prompt_id: body.prompt_id,
            user_id: body.user_id,

            // CT Indicators
            ct_decomposition: body.ct_decomposition || 0,
            ct_pattern_recognition: body.ct_pattern_recognition || 0,
            ct_abstraction: body.ct_abstraction || 0,
            ct_algorithm_design: body.ct_algorithm_design || 0,
            ct_evaluation_debugging: body.ct_evaluation_debugging || 0,
            ct_generalization: body.ct_generalization || 0,
            ct_total_score: ctTotalScore,

            // Critical Thinking Indicators
            cth_interpretation: body.cth_interpretation || 0,
            cth_analysis: body.cth_analysis || 0,
            cth_evaluation: body.cth_evaluation || 0,
            cth_inference: body.cth_inference || 0,
            cth_explanation: body.cth_explanation || 0,
            cth_self_regulation: body.cth_self_regulation || 0,
            cth_total_score: cthTotalScore,

            // Cognitive depth
            cognitive_depth_level: body.cognitive_depth_level || null,

            // Evidence
            evidence_text: body.evidence_text || null,
            indicator_notes: body.indicator_notes || null,

            // Metadata
            assessed_by: body.assessed_by,
            assessment_method: body.assessment_method || 'manual_coding',

            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await adminDb
            .from('cognitive_indicators')
            .insert(indicatorData);

        if (error) {
            console.error('Error creating cognitive indicators:', error);
            return NextResponse.json({ error: 'Failed to create indicators' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data as CognitiveIndicators,
            computed: {
                ct_total_score: ctTotalScore,
                cth_total_score: cthTotalScore
            },
            message: 'Cognitive indicators created successfully'
        }, { status: 201 });

    } catch (error) {
        console.error('Error in POST /api/admin/research/indicators:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
