import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { withApiLogging } from '@/lib/api-logger';

async function getHandler(request: NextRequest) {
  const admin = verifyAdminFromCookie(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');

  if (!userId) {
    return NextResponse.json({ error: 'Parameter user_id diperlukan' }, { status: 400 });
  }

  try {
    // Fetch all scores for this user
    const { data: allScores, error } = await adminDb
      .from('auto_cognitive_scores')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[AutoScoresSummary] Query failed:', error);
      return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 });
    }

    const scores = allScores || [];

    if (scores.length === 0) {
      return NextResponse.json({
        success: true,
        by_source: {},
        overall: { total_count: 0, avg_ct: 0, avg_crt: 0, indicator_breakdown: null },
        progression: [],
        follow_up_comparison: null,
        stage_correlation: null,
      });
    }

    // Aggregate by source
    const bySource: Record<string, { count: number; ct_sum: number; crt_sum: number; depth_sum: number }> = {};
    for (const s of scores) {
      const src = s.source as string;
      if (!bySource[src]) bySource[src] = { count: 0, ct_sum: 0, crt_sum: 0, depth_sum: 0 };
      bySource[src].count++;
      bySource[src].ct_sum += s.ct_total_score || 0;
      bySource[src].crt_sum += s.cth_total_score || 0;
      bySource[src].depth_sum += s.cognitive_depth_level || 0;
    }

    const bySourceResult: Record<string, { count: number; avg_ct: number; avg_crt: number; avg_depth: number }> = {};
    for (const [src, agg] of Object.entries(bySource)) {
      bySourceResult[src] = {
        count: agg.count,
        avg_ct: Math.round((agg.ct_sum / agg.count) * 100) / 100,
        avg_crt: Math.round((agg.crt_sum / agg.count) * 100) / 100,
        avg_depth: Math.round((agg.depth_sum / agg.count) * 10) / 10,
      };
    }

    // Overall indicator breakdown
    const indicatorKeys = [
      'ct_decomposition', 'ct_pattern_recognition', 'ct_abstraction',
      'ct_algorithm_design', 'ct_evaluation_debugging', 'ct_generalization',
      'cth_interpretation', 'cth_analysis', 'cth_evaluation',
      'cth_inference', 'cth_explanation', 'cth_self_regulation',
    ] as const;

    const indicatorBreakdown: Record<string, number> = {};
    for (const key of indicatorKeys) {
      const sum = scores.reduce((acc: number, s: Record<string, unknown>) => acc + (Number(s[key]) || 0), 0);
      indicatorBreakdown[key] = Math.round((sum / scores.length) * 100) / 100;
    }

    const totalCt = scores.reduce((acc: number, s: Record<string, unknown>) => acc + (Number(s.ct_total_score) || 0), 0);
    const totalCrt = scores.reduce((acc: number, s: Record<string, unknown>) => acc + (Number(s.cth_total_score) || 0), 0);

    // Progression (daily averages)
    const dailyMap = new Map<string, { ct_sum: number; crt_sum: number; count: number; source: string }>();
    for (const s of scores) {
      const day = (s.created_at as string).slice(0, 10);
      const key = `${day}_${s.source}`;
      if (!dailyMap.has(key)) dailyMap.set(key, { ct_sum: 0, crt_sum: 0, count: 0, source: s.source as string });
      const entry = dailyMap.get(key)!;
      entry.ct_sum += s.ct_total_score || 0;
      entry.crt_sum += s.cth_total_score || 0;
      entry.count++;
    }

    const progression = Array.from(dailyMap.entries())
      .map(([key, val]) => ({
        date: key.split('_')[0],
        ct_total: Math.round((val.ct_sum / val.count) * 100) / 100,
        crt_total: Math.round((val.crt_sum / val.count) * 100) / 100,
        source: val.source,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Follow-up comparison (ask_question only)
    const askScores = scores.filter((s: Record<string, unknown>) => s.source === 'ask_question');
    const followUps = askScores.filter((s: Record<string, unknown>) => s.is_follow_up === true);
    const nonFollowUps = askScores.filter((s: Record<string, unknown>) => !s.is_follow_up);

    const followUpComparison = askScores.length > 0 ? {
      follow_up_count: followUps.length,
      follow_up_avg_crt: followUps.length > 0
        ? Math.round((followUps.reduce((a: number, s: Record<string, unknown>) => a + (Number(s.cth_total_score) || 0), 0) / followUps.length) * 100) / 100
        : 0,
      non_follow_up_count: nonFollowUps.length,
      non_follow_up_avg_crt: nonFollowUps.length > 0
        ? Math.round((nonFollowUps.reduce((a: number, s: Record<string, unknown>) => a + (Number(s.cth_total_score) || 0), 0) / nonFollowUps.length) * 100) / 100
        : 0,
    } : null;

    // Stage correlation
    const stageMap = new Map<string, { count: number; ct_sum: number; crt_sum: number; depth_sum: number }>();
    for (const s of scores) {
      const stage = (s.prompt_stage as string) || null;
      if (!stage) continue;
      if (!stageMap.has(stage)) stageMap.set(stage, { count: 0, ct_sum: 0, crt_sum: 0, depth_sum: 0 });
      const entry = stageMap.get(stage)!;
      entry.count++;
      entry.ct_sum += s.ct_total_score || 0;
      entry.crt_sum += s.cth_total_score || 0;
      entry.depth_sum += s.cognitive_depth_level || 0;
    }

    const stageCorrelation = Array.from(stageMap.entries()).map(([stage, val]) => ({
      stage,
      count: val.count,
      avg_ct: Math.round((val.ct_sum / val.count) * 100) / 100,
      avg_crt: Math.round((val.crt_sum / val.count) * 100) / 100,
      avg_depth: Math.round((val.depth_sum / val.count) * 10) / 10,
    }));

    return NextResponse.json({
      success: true,
      by_source: bySourceResult,
      overall: {
        total_count: scores.length,
        avg_ct: Math.round((totalCt / scores.length) * 100) / 100,
        avg_crt: Math.round((totalCrt / scores.length) * 100) / 100,
        indicator_breakdown: indicatorBreakdown,
      },
      progression,
      follow_up_comparison: followUpComparison,
      stage_correlation: stageCorrelation,
    });
  } catch (err) {
    console.error('[AutoScoresSummary] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiLogging(getHandler, { label: 'admin.auto-scores-summary' });
