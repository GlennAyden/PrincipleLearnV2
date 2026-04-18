/**
 * API Route: Research Data Export
 * GET /api/admin/research/export - Export research data
 * ?format=json|csv&spss=true|false&data_type=all|sessions|classifications|indicators|evidence|longitudinal|readiness
 * ?anonymize=true|false&user_id=...&course_id=...&start_date=...&end_date=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';
import type {
    LearningSession,
    PromptClassification,
    CognitiveIndicators
} from '@/types/research';
import { normalizePromptStage } from '@/lib/research-normalizers';
import { buildResearchReadinessSnapshot } from '@/services/research-field-readiness.service';

const JWT_SECRET = process.env.JWT_SECRET!;

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

// SPSS Data Generator - async, fetches from DB
async function generateSPSSData(
    userId?: string,
    courseId?: string,
    startDate?: string,
    endDate?: string
): Promise<Record<string, unknown>[]> {
    let query = adminDb
        .from('learning_sessions')
        .select('*')
        .order('session_number', { ascending: true });

    if (userId) query = query.eq('user_id', userId);
    if (courseId) query = query.eq('course_id', courseId);
    if (startDate) query = query.gte('session_date', startDate);
    if (endDate) query = query.lte('session_date', endDate);

    const { data: sessions, error } = await query;

    if (error || !sessions || sessions.length === 0) {
        return [];
    }

    // Fetch related classifications and indicators
    const sessionIds = sessions.map((s: { id: string }) => s.id);

    const { data: allClassifications } = await adminDb
        .from('prompt_classifications')
        .select('id, learning_session_id, prompt_stage, prompt_stage_score');

    const classificationIds = ((allClassifications || []) as Array<{ id: string; learning_session_id?: string | null }>)
        .filter((row) => row.learning_session_id && sessionIds.includes(row.learning_session_id))
        .map((row) => row.id);
    const { data: allIndicators } = classificationIds.length > 0
        ? await adminDb
            .from('cognitive_indicators')
            .select('*')
            .in('prompt_classification_id', classificationIds)
        : { data: [] };

    // Build maps
    const classificationsBySession = new Map<string, { id: string; prompt_stage?: string | null; prompt_stage_score: number }[]>();
    (allClassifications || []).forEach((c: { id: string; learning_session_id?: string; prompt_stage?: string | null; prompt_stage_score: number }) => {
        if (c.learning_session_id && sessionIds.includes(c.learning_session_id)) {
            const existing = classificationsBySession.get(c.learning_session_id) || [];
            existing.push({ id: c.id, prompt_stage: c.prompt_stage, prompt_stage_score: c.prompt_stage_score || 0 });
            classificationsBySession.set(c.learning_session_id, existing);
        }
    });

    const indicatorsByClassification = new Map<string, Record<string, unknown>[]>();
    (allIndicators || []).forEach((indicator: Record<string, unknown>) => {
        const classificationId = String(indicator.prompt_classification_id ?? '');
        const existing = indicatorsByClassification.get(classificationId) || [];
        existing.push(indicator);
        indicatorsByClassification.set(classificationId, existing);
    });

    // Flatten for SPSS (one row per session with joined metrics)
    const spssRows: Record<string, unknown>[] = sessions.map((session: Record<string, unknown>) => {
        const classifications = classificationsBySession.get(session.id as string) || [];

        const stageScores = classifications.map(c => c.prompt_stage_score);
        const avgStageScore = stageScores.length > 0
            ? stageScores.reduce((a, b) => a + b, 0) / stageScores.length
            : 0;
        const indicatorRows = classifications.flatMap((classification) => indicatorsByClassification.get(classification.id) || []);
        const ctScores = indicatorRows.map((row) => totalScore(row, CT_KEYS, row.ct_total_score as number | undefined));
        const cthScores = indicatorRows.map((row) => totalScore(row, CTH_KEYS, row.cth_total_score as number | undefined));
        const stageCounts = classifications.reduce((acc, classification) => {
            const stage = normalizePromptStage(classification.prompt_stage);
            acc[stage] = (acc[stage] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return {
            session_id: session.id,
            session_number: session.session_number,
            user_id: (session.user_id as string).substring(0, 8),
            course_id: session.course_id,
            created_at: session.created_at,
            avg_prompt_stage_score: Math.round(avgStageScore * 100) / 100,
            dominant_prompt_stage: Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
            total_classifications: classifications.length,
            avg_ct_score: average(ctScores),
            avg_critical_score: average(cthScores),
            total_indicator_records: indicatorRows.length
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
        'dominant_prompt_stage',
        'total_classifications',
        'avg_ct_score',
        'avg_critical_score',
        'total_indicator_records'
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
        const spssFormat = searchParams.get('spss') === 'true' || searchParams.get('type') === 'spss';
        const dataType = normalizeDataType(searchParams.get('data_type') ?? searchParams.get('type'), spssFormat);
        const userId = searchParams.get('user_id');
        const courseId = searchParams.get('course_id');
        const anonymize = searchParams.get('anonymize') === 'true';
        const startDate = searchParams.get('start_date') ?? searchParams.get('startDate') ?? undefined;
        const endDate = searchParams.get('end_date') ?? searchParams.get('endDate') ?? undefined;

        // Validate format
        if (!['json', 'csv'].includes(format)) {
            return NextResponse.json({
                error: 'Invalid format. Must be one of: json, csv'
            }, { status: 400 });
        }

        // SPSS Export
        if (spssFormat) {
            const spssData = await generateSPSSData(userId || undefined, courseId || undefined, startDate, endDate);

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
        if (!dataType || !['sessions', 'classifications', 'indicators', 'evidence', 'longitudinal', 'readiness', 'all'].includes(dataType)) {
            return NextResponse.json({
                error: 'Invalid data_type. Must be one of: sessions, classifications, indicators, evidence, longitudinal, readiness, all'
            }, { status: 400 });
        }

        // Collect data based on type
        const exportData: Record<string, unknown> = {};
        const anonymizationContext = createAnonymizationContext();

        if (dataType === 'sessions' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('learning_sessions').select('*');
            if (userId) query = query.eq('user_id', userId);
            if (courseId) query = query.eq('course_id', courseId);
            if (startDate) query = query.gte('session_date', startDate);
            if (endDate) query = query.lte('session_date', endDate);
            query = query.order('session_number', { ascending: true });

            const { data: sessions } = await query;
            exportData.sessions = anonymize ? anonymizeData(sessions, 'sessions', anonymizationContext) : (sessions || []);
        }

        if (dataType === 'classifications' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('prompt_classifications').select('*');
            if (userId) query = query.eq('user_id', userId);
            if (courseId) query = query.eq('course_id', courseId);
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
            query = query.order('created_at', { ascending: true });

            const { data: classifications } = await query;
            exportData.classifications = anonymize ? anonymizeData(classifications, 'classifications', anonymizationContext) : (classifications || []);
        }

        if (dataType === 'indicators' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb.from('cognitive_indicators').select('*');
            if (userId) query = query.eq('user_id', userId);
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
            query = query.order('created_at', { ascending: true });

            const { data: indicators } = await query;
            exportData.indicators = anonymize ? anonymizeData(indicators, 'indicators', anonymizationContext) : (indicators || []);

            let autoScoreQuery = adminDb.from('auto_cognitive_scores').select('*');
            if (userId) autoScoreQuery = autoScoreQuery.eq('user_id', userId);
            if (courseId) autoScoreQuery = autoScoreQuery.eq('course_id', courseId);
            if (startDate) autoScoreQuery = autoScoreQuery.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) autoScoreQuery = autoScoreQuery.lte('created_at', `${endDate}T23:59:59`);
            autoScoreQuery = autoScoreQuery.order('created_at', { ascending: true });
            const { data: autoScores, error: autoScoreError } = await autoScoreQuery;
            exportData.auto_cognitive_scores = autoScoreError
                ? []
                : (anonymize ? anonymizeData(autoScores, 'auto_cognitive_scores', anonymizationContext) : (autoScores || []));
        }

        if (dataType === 'evidence' || dataType === 'all' || dataType === 'longitudinal') {
            let evidenceQuery = adminDb.from('research_evidence_items').select('*');
            if (userId) evidenceQuery = evidenceQuery.eq('user_id', userId);
            if (courseId) evidenceQuery = evidenceQuery.eq('course_id', courseId);
            if (startDate) evidenceQuery = evidenceQuery.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) evidenceQuery = evidenceQuery.lte('created_at', `${endDate}T23:59:59`);
            evidenceQuery = evidenceQuery.order('created_at', { ascending: true });

            const { data: evidenceItems, error: evidenceError } = await evidenceQuery;
            exportData.evidence_items = evidenceError ? [] : (anonymize ? anonymizeData(evidenceItems, 'evidence_items', anonymizationContext) : (evidenceItems || []));

            let artifactQuery = adminDb.from('research_artifacts').select('*');
            if (userId) artifactQuery = artifactQuery.eq('user_id', userId);
            if (courseId) artifactQuery = artifactQuery.eq('course_id', courseId);
            if (startDate) artifactQuery = artifactQuery.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) artifactQuery = artifactQuery.lte('created_at', `${endDate}T23:59:59`);
            artifactQuery = artifactQuery.order('created_at', { ascending: true });
            const { data: artifacts, error: artifactsError } = await artifactQuery;
            exportData.artifacts = artifactsError ? [] : (anonymize ? anonymizeData(artifacts, 'artifacts', anonymizationContext) : (artifacts || []));

            let triangulationQuery = adminDb.from('triangulation_records').select('*');
            if (userId) triangulationQuery = triangulationQuery.eq('user_id', userId);
            if (courseId) triangulationQuery = triangulationQuery.eq('course_id', courseId);
            if (startDate) triangulationQuery = triangulationQuery.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) triangulationQuery = triangulationQuery.lte('created_at', `${endDate}T23:59:59`);
            triangulationQuery = triangulationQuery.order('created_at', { ascending: true });
            const { data: triangulation, error: triangulationError } = await triangulationQuery;
            exportData.triangulation = triangulationError ? [] : (anonymize ? anonymizeData(triangulation, 'triangulation', anonymizationContext) : (triangulation || []));
        }

        if (dataType === 'classifications' || dataType === 'all' || dataType === 'longitudinal') {
            let query = adminDb
                .from('ask_question_history')
                .select('id, user_id, course_id, learning_session_id, session_number, question, answer, prompt_stage, stage_confidence, micro_markers, is_follow_up, created_at');
            if (userId) query = query.eq('user_id', userId);
            if (courseId) query = query.eq('course_id', courseId);
            if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
            if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
            query = query.order('created_at', { ascending: true });

            const { data: rawLogs } = await query;
            exportData.raw_prompt_logs = anonymize ? anonymizeData(rawLogs, 'raw_prompt_logs', anonymizationContext) : (rawLogs || []);
        }

        if (dataType === 'readiness' || dataType === 'all') {
            const readinessSnapshot = await buildResearchReadinessSnapshot({
                userId,
                courseId,
                startDate,
                endDate,
            });
            exportData.readiness_summary = readinessSnapshot.summary;
            exportData.field_readiness = readinessSnapshot.field_readiness;
            exportData.readiness_rows = anonymize
                ? anonymizeData(readinessSnapshot.rows, 'readiness_rows', anonymizationContext)
                : readinessSnapshot.rows;
        }

        if (dataType === 'all' || dataType === 'longitudinal') {
            exportData.codebook = buildResearchCodebook();
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
                filters: { user_id: userId, course_id: courseId, start_date: startDate, end_date: endDate, anonymize },
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
            filters: { user_id: userId, course_id: courseId, start_date: startDate, end_date: endDate, anonymize },
            record_count: totalRecords,
            data: exportData,
            created_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in GET /api/admin/research/export:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

interface AnonymizationContext {
    participantMap: Map<string, string>;
    nextParticipantNumber: number;
}

function createAnonymizationContext(): AnonymizationContext {
    return {
        participantMap: new Map<string, string>(),
        nextParticipantNumber: 1,
    };
}

// Helper: Anonymize identity fields while preserving research evidence text.
function anonymizeData(data: unknown[] | null, _type: string, context: AnonymizationContext): unknown[] {
    if (!data || data.length === 0) return [];

    return data.map((item: unknown) => {
        const record = item as Record<string, unknown>;
        const anonymized = { ...record };

        const participantCode = getParticipantCode(
            context,
            firstString(anonymized.user_id, anonymized.student_id, anonymized.id),
        );
        if (participantCode) {
            anonymized.participant_code = participantCode;
            if (anonymized.user_id) anonymized.user_id = participantCode;
            if (anonymized.student_id) anonymized.student_id = participantCode;
            if (anonymized.anonymous_id) anonymized.anonymous_id = participantCode;
        }

        delete anonymized.email;
        delete anonymized.student_email;
        delete anonymized.user_email;
        delete anonymized.name;
        delete anonymized.student_name;
        delete anonymized.user_name;

        return anonymized;
    });
}

function getParticipantCode(context: AnonymizationContext, rawId?: string | null): string | null {
    if (!rawId) return null;
    if (!context.participantMap.has(rawId)) {
        const code = `S${String(context.nextParticipantNumber).padStart(3, '0')}`;
        context.participantMap.set(rawId, code);
        context.nextParticipantNumber += 1;
    }
    return context.participantMap.get(rawId) ?? null;
}

function firstString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
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
        records = [
            ...((data.classifications as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'classification', ...row })),
            ...((data.raw_prompt_logs as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'raw_prompt_log', ...row })),
        ];
    } else if (dataType === 'indicators') {
        records = [
            ...((data.indicators as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'manual_indicator', ...row })),
            ...((data.auto_cognitive_scores as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'auto_cognitive_score', ...row })),
        ];
    } else if (dataType === 'evidence') {
        records = [
            ...((data.evidence_items as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'evidence_item', ...row })),
            ...((data.artifacts as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'artifact', ...row })),
            ...((data.triangulation as Record<string, unknown>[]) || []).map((row) => ({ record_type: 'triangulation', ...row })),
        ];
    } else if (dataType === 'readiness') {
        records = buildReadinessCsvRecords(data);
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
        if (data.auto_cognitive_scores) {
            (data.auto_cognitive_scores as Record<string, unknown>[]).forEach(i => {
                allRecords.push({ record_type: 'auto_cognitive_score', ...i });
            });
        }
        if (data.raw_prompt_logs) {
            (data.raw_prompt_logs as Record<string, unknown>[]).forEach(log => {
                allRecords.push({ record_type: 'raw_prompt_log', ...log });
            });
        }
        if (data.evidence_items) {
            (data.evidence_items as Record<string, unknown>[]).forEach(item => {
                allRecords.push({ record_type: 'evidence_item', ...item });
            });
        }
        if (data.artifacts) {
            (data.artifacts as Record<string, unknown>[]).forEach(item => {
                allRecords.push({ record_type: 'artifact', ...item });
            });
        }
        if (data.triangulation) {
            (data.triangulation as Record<string, unknown>[]).forEach(item => {
                allRecords.push({ record_type: 'triangulation', ...item });
            });
        }
        buildReadinessCsvRecords(data).forEach(item => {
            allRecords.push(item);
        });
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
    if (data.auto_cognitive_scores) count += (data.auto_cognitive_scores as unknown[]).length;
    if (data.raw_prompt_logs) count += (data.raw_prompt_logs as unknown[]).length;
    if (data.evidence_items) count += (data.evidence_items as unknown[]).length;
    if (data.artifacts) count += (data.artifacts as unknown[]).length;
    if (data.triangulation) count += (data.triangulation as unknown[]).length;
    if (data.readiness_rows) count += (data.readiness_rows as unknown[]).length;
    return count;
}

function normalizeDataType(raw: string | null, spssFormat: boolean): string | null {
    if (spssFormat) return 'all';
    const value = String(raw || 'all').trim().toLowerCase();
    if (value === 'full') return 'all';
    if (value === 'prompts' || value === 'rm2') return 'classifications';
    if (value === 'rm3') return 'indicators';
    if (value === 'evidence' || value === 'triangulation' || value === 'artifacts') return 'evidence';
    if (value === 'field_readiness' || value === 'kesiapan') return 'readiness';
    if (['sessions', 'classifications', 'indicators', 'evidence', 'longitudinal', 'readiness', 'all'].includes(value)) return value;
    return null;
}

function buildReadinessCsvRecords(data: Record<string, unknown>): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    if (data.readiness_rows) {
        (data.readiness_rows as Record<string, unknown>[]).forEach(row => {
            rows.push({ record_type: 'student_readiness', ...row });
        });
    }

    const fieldReadiness = data.field_readiness as Record<string, unknown> | undefined;
    if (fieldReadiness?.checklist && Array.isArray(fieldReadiness.checklist)) {
        (fieldReadiness.checklist as Record<string, unknown>[]).forEach(item => {
            rows.push({ record_type: 'field_readiness_check', ...item });
        });
    }
    if (fieldReadiness?.thesis_outputs && Array.isArray(fieldReadiness.thesis_outputs)) {
        (fieldReadiness.thesis_outputs as Record<string, unknown>[]).forEach(item => {
            rows.push({ record_type: 'thesis_output_check', ...item });
        });
    }

    return rows;
}

const CT_KEYS = [
    'ct_decomposition',
    'ct_pattern_recognition',
    'ct_abstraction',
    'ct_algorithm_design',
    'ct_evaluation_debugging',
    'ct_generalization',
] as const;

const CTH_KEYS = [
    'cth_interpretation',
    'cth_analysis',
    'cth_evaluation',
    'cth_inference',
    'cth_explanation',
    'cth_self_regulation',
] as const;

function totalScore(row: Record<string, unknown>, keys: readonly string[], explicit?: number | null): number {
    const explicitNumber = Number(explicit);
    if (Number.isFinite(explicitNumber) && explicitNumber > 0) return explicitNumber;
    return keys.reduce((sum, key) => sum + (Number(row[key]) || 0), 0);
}

function average(values: number[]): number {
    const valid = values.filter((value) => Number.isFinite(value));
    if (valid.length === 0) return 0;
    return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}

function buildResearchCodebook() {
    return {
        RM2: {
            focus: 'Tahapan perkembangan struktur prompt siswa secara longitudinal',
            stages: {
                SCP: 'Simple Clarification Prompt: pertanyaan tunggal, langsung, minim konteks',
                SRP: 'Structured Reformulation Prompt: reformulasi dengan konteks atau tujuan yang lebih jelas',
                MQP: 'Multi-Question Prompt: pertanyaan berlapis dan iteratif',
                REFLECTIVE: 'Reflektif: evaluasi solusi, perbandingan alternatif, dan justifikasi keputusan',
            },
            micro_markers: {
                GCP: 'Goal and Contextualized Prompting',
                PP: 'Procedural Prompting',
                ARP: 'Analytical and Reflective Prompting',
            },
            trajectory_statuses: ['naik_stabil', 'stagnan', 'fluktuatif', 'anomali', 'turun'],
        },
        RM3: {
            focus: 'Manifestasi computational thinking dan critical thinking pada setiap tahap prompt',
            computational_thinking: [
                'ct_decomposition',
                'ct_pattern_recognition',
                'ct_abstraction',
                'ct_algorithm_design',
                'ct_evaluation_debugging',
                'ct_generalization',
            ],
            critical_thinking: [
                'cth_interpretation',
                'cth_analysis',
                'cth_evaluation',
                'cth_inference',
                'cth_explanation',
                'cth_self_regulation',
            ],
            score_scale: {
                0: 'belum muncul',
                1: 'muncul sebagian',
                2: 'muncul jelas',
            },
        },
        evidence: {
            source_types: [
                'ask_question',
                'challenge_response',
                'quiz_submission',
                'journal',
                'discussion',
                'artifact',
                'manual_note',
            ],
            coding_status: ['uncoded', 'auto_coded', 'manual_coded', 'reviewed'],
            validity_status: ['valid', 'low_information', 'duplicate', 'excluded', 'manual_note'],
            evidence_status: ['raw', 'coded', 'triangulated', 'excluded', 'needs_review'],
        },
        field_readiness: {
            purpose: 'Memastikan data siap dipakai saat pengambilan data lapangan dan penulisan hasil tesis',
            target_window: '4 minggu pengambilan data longitudinal',
            statuses: {
                ready: 'siap dipakai sebagai data penelitian',
                partial: 'sebagian terpenuhi dan perlu dilengkapi/direview',
                blocked: 'belum cukup untuk dijadikan dasar klaim tesis',
            },
            checklist_ids: [
                'raw_prompt_ai_answers',
                'one_month_window',
                'session_binding',
                'rm2_prompt_coding',
                'rm3_indicator_coding',
                'evidence_bank_coding',
                'triangulation',
                'export_lampiran',
            ],
        },
    };
}
