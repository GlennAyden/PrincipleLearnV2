/**
 * API Route: Research Data Export
 * For exporting research data in various formats (JSON, CSV)
 * 
 * GET /api/admin/research/export - Export research data
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type {
    LearningSession,
    PromptClassification,
    CognitiveIndicators,
    ResearchExportOptions
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

// GET: Export research data
export async function GET(request: NextRequest) {
    try {
        // Verify admin token from cookie
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Parse query parameters
        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format') || 'json';
        const dataType = searchParams.get('data_type') || 'all';
        const userId = searchParams.get('user_id');
        const courseId = searchParams.get('course_id');
        const anonymize = searchParams.get('anonymize') === 'true';

        // Validate format
        if (!['json', 'csv'].includes(format)) {
            return NextResponse.json({
                error: 'Invalid format. Must be one of: json, csv'
            }, { status: 400 });
        }

        // Validate data_type
        if (!['sessions', 'classifications', 'indicators', 'longitudinal', 'all'].includes(dataType)) {
            return NextResponse.json({
                error: 'Invalid data_type. Must be one of: sessions, classifications, indicators, longitudinal, all'
            }, { status: 400 });
        }

        // Collect data based on type
        const exportData: Record<string, unknown> = {};

        if (dataType === 'sessions' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('learning_sessions').select('*');
            if (userId) query = query.eq('user_id', userId);
            if (courseId) query = query.eq('course_id', courseId);
            query = query.order('session_number', { ascending: true });

            const { data: sessions } = await query;
            exportData.sessions = anonymize ? anonymizeData(sessions, 'sessions') : sessions;
        }

        if (dataType === 'classifications' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('prompt_classifications').select('*');
            if (userId) query = query.eq('user_id', userId);
            if (courseId) query = query.eq('course_id', courseId);
            query = query.order('created_at', { ascending: true });

            const { data: classifications } = await query;
            exportData.classifications = anonymize ? anonymizeData(classifications, 'classifications') : classifications;
        }

        if (dataType === 'indicators' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('cognitive_indicators').select('*');
            if (userId) query = query.eq('user_id', userId);
            query = query.order('created_at', { ascending: true });

            const { data: indicators } = await query;
            exportData.indicators = anonymize ? anonymizeData(indicators, 'indicators') : indicators;
        }

        // For longitudinal analysis, compute additional metrics
        if (dataType === 'longitudinal') {
            exportData.longitudinal_analysis = computeLongitudinalAnalysis(
                exportData.sessions as LearningSession[],
                exportData.classifications as PromptClassification[],
                exportData.indicators as CognitiveIndicators[]
            );
        }

        // Format response
        if (format === 'csv') {
            const csvData = convertToCSV(exportData, dataType);
            return new NextResponse(csvData, {
                status: 200,
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="research_export_${dataType}_${new Date().toISOString().split('T')[0]}.csv"`
                }
            });
        }

        return NextResponse.json({
            success: true,
            export_id: `export_${Date.now()}`,
            format,
            data_type: dataType,
            record_count: countRecords(exportData),
            data: exportData,
            created_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in GET /api/admin/research/export:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// Helper: Anonymize data
function anonymizeData(data: unknown[] | null, type: string): unknown[] {
    if (!data) return [];

    const userIdMap = new Map<string, string>();
    let userCounter = 1;

    return data.map((item: unknown) => {
        const record = item as Record<string, unknown>;
        const anonymized = { ...record };

        // Anonymize user_id
        if (anonymized.user_id) {
            const originalId = anonymized.user_id as string;
            if (!userIdMap.has(originalId)) {
                userIdMap.set(originalId, `STUDENT_${String(userCounter++).padStart(3, '0')}`);
            }
            anonymized.user_id = userIdMap.get(originalId);
        }

        // Remove potentially identifying fields
        delete anonymized.researcher_notes;
        delete anonymized.evidence_text;

        return anonymized;
    });
}

// Helper: Compute longitudinal analysis
function computeLongitudinalAnalysis(
    sessions: LearningSession[] | null,
    classifications: PromptClassification[] | null,
    indicators: CognitiveIndicators[] | null
): Record<string, unknown> {
    if (!sessions || !classifications || !indicators) {
        return { error: 'Insufficient data for longitudinal analysis' };
    }

    // Group by user
    const userSessions = new Map<string, LearningSession[]>();
    sessions.forEach(s => {
        const existing = userSessions.get(s.user_id) || [];
        existing.push(s);
        userSessions.set(s.user_id, existing);
    });

    const userClassifications = new Map<string, PromptClassification[]>();
    classifications.forEach(c => {
        const existing = userClassifications.get(c.user_id) || [];
        existing.push(c);
        userClassifications.set(c.user_id, existing);
    });

    const userIndicators = new Map<string, CognitiveIndicators[]>();
    indicators.forEach(i => {
        const existing = userIndicators.get(i.user_id) || [];
        existing.push(i);
        userIndicators.set(i.user_id, existing);
    });

    // Compute per-user longitudinal metrics
    const userAnalysis: Record<string, unknown>[] = [];

    userSessions.forEach((userSessionList, userId) => {
        const userClassList = userClassifications.get(userId) || [];
        const userIndList = userIndicators.get(userId) || [];

        // Sort sessions by number
        userSessionList.sort((a, b) => a.session_number - b.session_number);

        // Calculate stage progression
        const stageProgression = userClassList.map(c => ({
            session: c.learning_session_id,
            stage: c.prompt_stage,
            score: c.prompt_stage_score
        }));

        // Calculate CT/CTh progression
        const ctProgression = userIndList.map(i => ({
            ct_score: i.ct_total_score,
            cth_score: i.cth_total_score,
            depth: i.cognitive_depth_level
        }));

        // Compute averages
        const avgCtScore = ctProgression.length > 0
            ? ctProgression.reduce((sum, p) => sum + p.ct_score, 0) / ctProgression.length
            : 0;
        const avgCthScore = ctProgression.length > 0
            ? ctProgression.reduce((sum, p) => sum + p.cth_score, 0) / ctProgression.length
            : 0;

        // Determine overall transition
        const firstStage = stageProgression[0]?.score || 1;
        const lastStage = stageProgression[stageProgression.length - 1]?.score || 1;
        const overallTransition = lastStage - firstStage;

        userAnalysis.push({
            user_id: userId,
            total_sessions: userSessionList.length,
            total_prompts: userClassList.length,
            stage_progression: stageProgression,
            ct_progression: ctProgression,
            avg_ct_score: Math.round(avgCtScore * 100) / 100,
            avg_cth_score: Math.round(avgCthScore * 100) / 100,
            overall_stage_transition: overallTransition,
            transition_direction: overallTransition > 0 ? 'improved' : overallTransition < 0 ? 'declined' : 'stable'
        });
    });

    return {
        total_users: userSessions.size,
        total_sessions: sessions.length,
        total_classifications: classifications.length,
        total_indicators: indicators.length,
        user_analysis: userAnalysis
    };
}

// Helper: Convert to CSV
function convertToCSV(data: Record<string, unknown>, dataType: string): string {
    const lines: string[] = [];

    // Determine which data to convert
    let records: Record<string, unknown>[] = [];

    if (dataType === 'sessions' && data.sessions) {
        records = data.sessions as Record<string, unknown>[];
    } else if (dataType === 'classifications' && data.classifications) {
        records = data.classifications as Record<string, unknown>[];
    } else if (dataType === 'indicators' && data.indicators) {
        records = data.indicators as Record<string, unknown>[];
    } else if (dataType === 'all' || dataType === 'longitudinal') {
        // For 'all', combine all records with a type column
        const allRecords: Record<string, unknown>[] = [];

        if (data.sessions) {
            (data.sessions as Record<string, unknown>[]).forEach(s => {
                allRecords.push({ record_type: 'session', ...s });
            });
        }
        if (data.classifications) {
            (data.classifications as Record<string, unknown>[]).forEach(c => {
                allRecords.push({ record_type: 'classification', ...c });
            });
        }
        if (data.indicators) {
            (data.indicators as Record<string, unknown>[]).forEach(i => {
                allRecords.push({ record_type: 'indicator', ...i });
            });
        }

        records = allRecords;
    }

    if (records.length === 0) {
        return 'No data to export';
    }

    // Get all unique headers
    const headers = new Set<string>();
    records.forEach(record => {
        Object.keys(record).forEach(key => headers.add(key));
    });

    const headerArray = Array.from(headers);
    lines.push(headerArray.join(','));

    // Add data rows
    records.forEach(record => {
        const row = headerArray.map(header => {
            const value = record[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return String(value);
        });
        lines.push(row.join(','));
    });

    return lines.join('\n');
}

// Helper: Count records
function countRecords(data: Record<string, unknown>): number {
    let count = 0;
    if (data.sessions) count += (data.sessions as unknown[]).length;
    if (data.classifications) count += (data.classifications as unknown[]).length;
    if (data.indicators) count += (data.indicators as unknown[]).length;
    return count;
}
