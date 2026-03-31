/**
 * API Route: Research Data Export
 * GET /api/admin/research/export - Export research data
 * ?format=json|csv&spss=true|false&data_type=all|sessions|classifications|indicators|longitudinal
 * ?anonymize=true|false&user_id=...&course_id=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type {
    LearningSession,
    PromptClassification,
    CognitiveIndicators
} from '@/types/research';

const JWT_SECRET = process.env.JWT_SECRET!;

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

// SPSS Data Generator - async, fetches from DB
async function generateSPSSData(userId?: string, courseId?: string): Promise<Record<string, unknown>[]> {
    let query = adminDb
        .from('learning_sessions')
        .select('*')
        .order('session_number', { ascending: true });

    if (userId) query = query.eq('user_id', userId);
    if (courseId) query = query.eq('course_id', courseId);

    const { data: sessions, error } = await query;

    if (error || !sessions || sessions.length === 0) {
        return [];
    }

    // Fetch related classifications and indicators
    const sessionIds = sessions.map((s: { id: string }) => s.id);

    const { data: allClassifications } = await adminDb
        .from('prompt_classifications')
        .select('learning_session_id, prompt_stage_score');

    const { data: allIndicators } = await adminDb
        .from('cognitive_indicators')
        .select('prompt_classification_id, ct_total_score, cth_total_score');

    // Build maps
    const classificationsBySession = new Map<string, { prompt_stage_score: number }[]>();
    (allClassifications || []).forEach((c: { learning_session_id?: string; prompt_stage_score: number }) => {
        if (c.learning_session_id && sessionIds.includes(c.learning_session_id)) {
            const existing = classificationsBySession.get(c.learning_session_id) || [];
            existing.push({ prompt_stage_score: c.prompt_stage_score || 0 });
            classificationsBySession.set(c.learning_session_id, existing);
        }
    });

    // Flatten for SPSS (one row per session with joined metrics)
    const spssRows: Record<string, unknown>[] = sessions.map((session: Record<string, unknown>) => {
        const classifications = classificationsBySession.get(session.id as string) || [];

        const stageScores = classifications.map(c => c.prompt_stage_score);
        const avgStageScore = stageScores.length > 0
            ? stageScores.reduce((a, b) => a + b, 0) / stageScores.length
            : 0;

        return {
            session_id: session.id,
            session_number: session.session_number,
            user_id: (session.user_id as string).substring(0, 8),
            course_id: session.course_id,
            created_at: session.created_at,
            avg_prompt_stage_score: Math.round(avgStageScore * 100) / 100,
            total_classifications: classifications.length
        };
    });

    return spssRows;
}

// SPSS CSV Converter
function convertSPSStoCSV(data: Record<string, unknown>[]): string {
    if (!Array.isArray(data) || data.length === 0) {
        return 'user_id,session_number,avg_prompt_stage_score,total_classifications\nNo data available';
    }

    const headers = [
        'user_id',
        'session_number',
        'avg_prompt_stage_score',
        'total_classifications'
    ];

    let csv = headers.join(',') + '\n';

    data.forEach((row) => {
        const values = headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'number') return value.toFixed(3);
            return `"${String(value).replace(/"/g, '""')}"`;
        });
        csv += values.join(',') + '\n';
    });

    return csv;
}

// GET: Export research data
export async function GET(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format') || 'json';
        const dataType = searchParams.get('data_type') || 'all';
        const spssFormat = searchParams.get('spss') === 'true';
        const userId = searchParams.get('user_id');
        const courseId = searchParams.get('course_id');
        const anonymize = searchParams.get('anonymize') === 'true';

        // Validate format
        if (!['json', 'csv'].includes(format)) {
            return NextResponse.json({
                error: 'Invalid format. Must be one of: json, csv'
            }, { status: 400 });
        }

        // SPSS Export
        if (spssFormat) {
            const spssData = await generateSPSSData(userId || undefined, courseId || undefined);

            if (spssData.length === 0) {
                if (format === 'csv') {
                    return new NextResponse('No data available for SPSS export', {
                        status: 200,
                        headers: {
                            'Content-Type': 'text/csv; charset=utf-8',
                            'Content-Disposition': `attachment; filename="principlelearn_research_spss_empty.csv"`
                        }
                    });
                }
                return NextResponse.json({
                    success: true,
                    data: [],
                    spss_ready: true,
                    message: 'No data available for export'
                });
            }

            if (format === 'csv') {
                const csvContent = convertSPSStoCSV(spssData);
                return new NextResponse(csvContent, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': `attachment; filename="principlelearn_research_spss_${new Date().toISOString().split('T')[0]}.csv"`
                    }
                });
            }
            return NextResponse.json({ success: true, data: spssData, spss_ready: true });
        }

        // Regular export validation
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
            exportData.sessions = anonymize ? anonymizeData(sessions, 'sessions') : (sessions || []);
        }

        if (dataType === 'classifications' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('prompt_classifications').select('*');
            if (userId) query = query.eq('user_id', userId);
            if (courseId) query = query.eq('course_id', courseId);
            query = query.order('created_at', { ascending: true });

            const { data: classifications } = await query;
            exportData.classifications = anonymize ? anonymizeData(classifications, 'classifications') : (classifications || []);
        }

        if (dataType === 'indicators' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('cognitive_indicators').select('*');
            if (userId) query = query.eq('user_id', userId);
            query = query.order('created_at', { ascending: true });

            const { data: indicators } = await query;
            exportData.indicators = anonymize ? anonymizeData(indicators, 'indicators') : (indicators || []);
        }

        // Check if there's any data
        const totalRecords = countRecords(exportData);
        if (totalRecords === 0) {
            if (format === 'csv') {
                return new NextResponse('No data available for export', {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/csv; charset=utf-8',
                        'Content-Disposition': `attachment; filename="research_export_empty.csv"`
                    }
                });
            }
            return NextResponse.json({
                success: true,
                export_id: `export_${Date.now()}`,
                format,
                data_type: dataType,
                record_count: 0,
                data: exportData,
                message: 'No data available for the selected criteria',
                created_at: new Date().toISOString()
            });
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
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': `attachment; filename="research_export_${dataType}_${new Date().toISOString().split('T')[0]}.csv"`
                }
            });
        }

        return NextResponse.json({
            success: true,
            export_id: `export_${Date.now()}`,
            format,
            data_type: dataType,
            record_count: totalRecords,
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
    if (!data || data.length === 0) return [];

    const userIdMap = new Map<string, string>();
    let userCounter = 1;

    return data.map((item: unknown) => {
        const record = item as Record<string, unknown>;
        const anonymized = { ...record };

        if (anonymized.user_id) {
            const originalId = anonymized.user_id as string;
            if (!userIdMap.has(originalId)) {
                userIdMap.set(originalId, `STUDENT_${String(userCounter++).padStart(3, '0')}`);
            }
            anonymized.user_id = userIdMap.get(originalId);
        }

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
    if (!sessions?.length || !classifications?.length) {
        return { error: 'Insufficient data for longitudinal analysis', total_users: 0 };
    }

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
    (indicators || []).forEach(i => {
        const existing = userIndicators.get(i.user_id) || [];
        existing.push(i);
        userIndicators.set(i.user_id, existing);
    });

    const userAnalysis: Record<string, unknown>[] = [];

    userSessions.forEach((userSessionList, userId) => {
        const userClassList = userClassifications.get(userId) || [];
        const userIndList = userIndicators.get(userId) || [];

        userSessionList.sort((a, b) => a.session_number - b.session_number);

        const stageProgression = userClassList.map(c => ({
            session: c.learning_session_id,
            stage: c.prompt_stage,
            score: c.prompt_stage_score
        }));

        const ctProgression = userIndList.map(i => ({
            ct_score: i.ct_total_score,
            cth_score: i.cth_total_score,
            depth: i.cognitive_depth_level
        }));

        const avgCtScore = ctProgression.length > 0
            ? ctProgression.reduce((sum, p) => sum + p.ct_score, 0) / ctProgression.length
            : 0;
        const avgCthScore = ctProgression.length > 0
            ? ctProgression.reduce((sum, p) => sum + p.cth_score, 0) / ctProgression.length
            : 0;

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
        total_indicators: indicators?.length || 0,
        user_analysis: userAnalysis
    };
}

// Helper: Convert to CSV
function convertToCSV(data: Record<string, unknown>, dataType: string): string {
    let records: Record<string, unknown>[] = [];

    if (dataType === 'sessions' && data.sessions) {
        records = data.sessions as Record<string, unknown>[];
    } else if (dataType === 'classifications' && data.classifications) {
        records = data.classifications as Record<string, unknown>[];
    } else if (dataType === 'indicators' && data.indicators) {
        records = data.indicators as Record<string, unknown>[];
    } else if (dataType === 'all' || dataType === 'longitudinal') {
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

    const headers = new Set<string>();
    records.forEach(record => {
        Object.keys(record).forEach(key => headers.add(key));
    });

    const headerArray = Array.from(headers);
    const lines: string[] = [headerArray.join(',')];

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
