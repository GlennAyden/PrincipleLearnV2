/**
 * API Route: Research Analytics
 * GET /api/admin/research/analytics
 * 
 * Provides: counts, stage heatmap, user progression, inter-rater reliability,
 * totalStudents, stageDistribution - all from real DB queries
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withCacheHeaders } from '@/lib/api-middleware';
import jwt from 'jsonwebtoken';
import type { PromptStage } from '@/types/research';
import { PROMPT_STAGE_SCORES } from '@/types/research';

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

interface UserProgression {
    user_id: string;
    sessions: number;
    avg_stage_score: number;
    stage_distribution: Record<PromptStage, number>;
    ct_progression: number[];
    cth_progression: number[];
}

interface AnalyticsResponse {
    total_sessions: number;
    total_classifications: number;
    total_indicators: number;
    total_students: number;
    stage_distribution: Record<PromptStage, number>;
    stage_heatmap: Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }>;
    user_progression: UserProgression[];
    inter_rater_kappa: {
        prompt_stage: number;
        ct_indicators: number;
        reliability_status: 'excellent' | 'good' | 'fair' | 'poor';
    };
}

// GET /api/admin/research/analytics
export async function GET(request: NextRequest) {
    try {
        const user = verifyAdminFromCookie(request);
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const _userId = searchParams.get('user_id');
        const _courseId = searchParams.get('course_id');

        // 1. Efficient counts using select('id') instead of fetching full rows
        const [
            { data: sessionsData },
            { data: classificationsData },
            { data: indicatorsData }
        ] = await Promise.all([
            adminDb.from('learning_sessions').select('id, user_id'),
            adminDb.from('prompt_classifications').select('id, prompt_stage, user_id'),
            adminDb.from('cognitive_indicators').select('id')
        ]);

        const sessions = sessionsData || [];
        const classifications = classificationsData || [];
        const indicators = indicatorsData || [];

        const totalSessions = sessions.length;
        const totalClassifications = classifications.length;
        const totalIndicators = indicators.length;

        // Total unique students from sessions
        const uniqueStudents = new Set(sessions.map((s: { user_id: string }) => s.user_id));
        const totalStudents = uniqueStudents.size;

        // 2. Stage distribution from classifications
        const stageDistribution: Record<PromptStage, number> = { SCP: 0, SRP: 0, MQP: 0, REFLECTIVE: 0 };
        classifications.forEach((c: { prompt_stage: string }) => {
            const stage = c.prompt_stage as PromptStage;
            if (stage in stageDistribution) {
                stageDistribution[stage]++;
            }
        });

        // 3. Stage heatmap - get classifications with their cognitive indicator scores
        const stageHeatmap: Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }> = {
            SCP: { sessions: 0, avg_ct: 0, avg_cth: 0 },
            SRP: { sessions: 0, avg_ct: 0, avg_cth: 0 },
            MQP: { sessions: 0, avg_ct: 0, avg_cth: 0 },
            REFLECTIVE: { sessions: 0, avg_ct: 0, avg_cth: 0 }
        };

        // Get classifications with linked indicators for heatmap
        const { data: classWithIndicators } = await adminDb
            .from('prompt_classifications')
            .select('prompt_stage, learning_session_id');

        const { data: indicatorScores } = await adminDb
            .from('cognitive_indicators')
            .select('prompt_classification_id, ct_total_score, cth_total_score');

        // Build a map of classification_id -> scores
        const indicatorMap = new Map<string, { ct: number; cth: number }[]>();
        (indicatorScores || []).forEach((ind: { prompt_classification_id: string; ct_total_score: number; cth_total_score: number }) => {
            const existing = indicatorMap.get(ind.prompt_classification_id) || [];
            existing.push({ ct: ind.ct_total_score || 0, cth: ind.cth_total_score || 0 });
            indicatorMap.set(ind.prompt_classification_id, existing);
        });

        // Build heatmap using stage data
        const stageCounts: Record<PromptStage, { sessions: Set<string>; ctScores: number[]; cthScores: number[] }> = {
            SCP: { sessions: new Set(), ctScores: [], cthScores: [] },
            SRP: { sessions: new Set(), ctScores: [], cthScores: [] },
            MQP: { sessions: new Set(), ctScores: [], cthScores: [] },
            REFLECTIVE: { sessions: new Set(), ctScores: [], cthScores: [] }
        };

        (classWithIndicators || []).forEach((c: { prompt_stage: string; learning_session_id?: string; id?: string }) => {
            const stage = c.prompt_stage as PromptStage;
            if (stage in stageCounts) {
                if (c.learning_session_id) {
                    stageCounts[stage].sessions.add(c.learning_session_id);
                }
                // Get associated indicator scores
                const scores = indicatorMap.get((c as { id?: string }).id || '') || [];
                scores.forEach(s => {
                    stageCounts[stage].ctScores.push(s.ct);
                    stageCounts[stage].cthScores.push(s.cth);
                });
            }
        });

        for (const stage of ['SCP', 'SRP', 'MQP', 'REFLECTIVE'] as PromptStage[]) {
            const data = stageCounts[stage];
            stageHeatmap[stage] = {
                sessions: data.sessions.size,
                avg_ct: data.ctScores.length > 0
                    ? Math.round((data.ctScores.reduce((a, b) => a + b, 0) / data.ctScores.length) * 100) / 100
                    : 0,
                avg_cth: data.cthScores.length > 0
                    ? Math.round((data.cthScores.reduce((a, b) => a + b, 0) / data.cthScores.length) * 100) / 100
                    : 0
            };
        }

        // 4. User progression (top 10 users by session count)
        const userSessionCounts = new Map<string, number>();
        sessions.forEach((s: { user_id: string }) => {
            userSessionCounts.set(s.user_id, (userSessionCounts.get(s.user_id) || 0) + 1);
        });

        const topUsers = Array.from(userSessionCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([uid]) => uid);

        const userProgression: UserProgression[] = topUsers.map(uid => {
            const userClassifications = classifications.filter((c: { user_id: string }) => c.user_id === uid);
            const sessionCount = userSessionCounts.get(uid) || 0;

            // Stage distribution for this user
            const userStageDist: Record<PromptStage, number> = { SCP: 0, SRP: 0, MQP: 0, REFLECTIVE: 0 };
            let totalStageScore = 0;
            userClassifications.forEach((c: { prompt_stage: string }) => {
                const stage = c.prompt_stage as PromptStage;
                if (stage in userStageDist) {
                    userStageDist[stage]++;
                    totalStageScore += PROMPT_STAGE_SCORES[stage] || 0;
                }
            });

            const avgStageScore = userClassifications.length > 0
                ? Math.round((totalStageScore / userClassifications.length) * 100) / 100
                : 0;

            return {
                user_id: uid,
                sessions: sessionCount,
                avg_stage_score: avgStageScore,
                stage_distribution: userStageDist,
                ct_progression: [],  // Would need per-session indicator data for full progression
                cth_progression: []
            };
        });

        // 5. Inter-rater reliability - query from inter_rater_reliability table
        let interRaterKappa = {
            prompt_stage: 0,
            ct_indicators: 0,
            reliability_status: 'fair' as 'excellent' | 'good' | 'fair' | 'poor'
        };

        try {
            const { data: reliabilityData } = await adminDb
                .from('inter_rater_reliability')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (reliabilityData && reliabilityData.length > 0) {
                // Get the most recent reliability records
                const promptReliability = reliabilityData.find(
                    (r: { coding_type: string }) => r.coding_type === 'prompt_stage'
                );
                const ctReliability = reliabilityData.find(
                    (r: { coding_type: string }) => r.coding_type === 'ct_indicators'
                );

                const promptKappa = promptReliability?.cohens_kappa ?? 0;
                const ctKappa = ctReliability?.cohens_kappa ?? 0;
                const overallKappa = (promptKappa + ctKappa) / 2;

                interRaterKappa = {
                    prompt_stage: Math.round(promptKappa * 100) / 100,
                    ct_indicators: Math.round(ctKappa * 100) / 100,
                    reliability_status: overallKappa >= 0.7 ? 'excellent'
                        : overallKappa >= 0.5 ? 'good'
                        : overallKappa >= 0.3 ? 'fair'
                        : 'poor'
                };
            } else {
                // Fallback: calculate from classifications with multiple raters
                const { data: ratedClassifications } = await adminDb
                    .from('prompt_classifications')
                    .select('prompt_id, prompt_stage, classified_by')
                    .limit(200);

                if (ratedClassifications && ratedClassifications.length > 0) {
                    // Group by prompt_id to find items with multiple ratings
                    const promptRatings = new Map<string, { stage: string; rater: string }[]>();
                    ratedClassifications.forEach((r: { prompt_id: string; prompt_stage: string; classified_by: string }) => {
                        const existing = promptRatings.get(r.prompt_id) || [];
                        existing.push({ stage: r.prompt_stage, rater: r.classified_by });
                        promptRatings.set(r.prompt_id, existing);
                    });

                    // Find prompts with 2+ ratings
                    let agreements = 0;
                    let totalPairs = 0;
                    promptRatings.forEach(ratings => {
                        if (ratings.length >= 2) {
                            // Compare first two ratings
                            totalPairs++;
                            if (ratings[0].stage === ratings[1].stage) {
                                agreements++;
                            }
                        }
                    });

                    const observedAgreement = totalPairs > 0 ? agreements / totalPairs : 0;
                    // Simple kappa approximation (assumes 4 categories with equal chance)
                    const expectedAgreement = 0.25;
                    const kappa = expectedAgreement < 1
                        ? (observedAgreement - expectedAgreement) / (1 - expectedAgreement)
                        : 1;

                    interRaterKappa = {
                        prompt_stage: Math.round(Math.max(0, kappa) * 100) / 100,
                        ct_indicators: 0,
                        reliability_status: kappa >= 0.7 ? 'excellent'
                            : kappa >= 0.5 ? 'good'
                            : kappa >= 0.3 ? 'fair'
                            : 'poor'
                    };
                }
            }
        } catch (reliabilityError) {
            console.warn('Inter-rater reliability query failed, using defaults:', reliabilityError);
            // Keep default values
        }

        const response: AnalyticsResponse = {
            total_sessions: totalSessions,
            total_classifications: totalClassifications,
            total_indicators: totalIndicators,
            total_students: totalStudents,
            stage_distribution: stageDistribution,
            stage_heatmap: stageHeatmap,
            user_progression: userProgression,
            inter_rater_kappa: interRaterKappa
        };

        return withCacheHeaders(NextResponse.json({ success: true, data: response }), 60);

    } catch (error) {
        console.error('Analytics error:', error);
        return NextResponse.json({ error: 'Failed to generate analytics' }, { status: 500 });
    }
}
