import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { withApiLogging } from '@/lib/api-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

type GroupBy = 'sequence' | 'week' | 'session';

const DIMENSION_KEYS = [
  'ct_decomposition',
  'ct_pattern_recognition',
  'ct_abstraction',
  'ct_algorithm_design',
  'ct_evaluation_debugging',
  'ct_generalization',
  'cth_interpretation',
  'cth_analysis',
  'cth_evaluation',
  'cth_inference',
  'cth_explanation',
  'cth_self_regulation',
] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

interface RawScore {
  id: string;
  user_id: string;
  course_id: string | null;
  source: string;
  prompt_stage: string | null;
  cognitive_depth_level: number;
  confidence: number;
  evidence_summary: string | null;
  created_at: string;
  data_collection_week: number | null;
  learning_session_id: string | null;
  ct_decomposition: number;
  ct_pattern_recognition: number;
  ct_abstraction: number;
  ct_algorithm_design: number;
  ct_evaluation_debugging: number;
  ct_generalization: number;
  cth_interpretation: number;
  cth_analysis: number;
  cth_evaluation: number;
  cth_inference: number;
  cth_explanation: number;
  cth_self_regulation: number;
}

export interface HeatmapEntry {
  groupKey: string;
  label: string;
  ct_decomposition: number | null;
  ct_pattern_recognition: number | null;
  ct_abstraction: number | null;
  ct_algorithm_design: number | null;
  ct_evaluation_debugging: number | null;
  ct_generalization: number | null;
  cth_interpretation: number | null;
  cth_analysis: number | null;
  cth_evaluation: number | null;
  cth_inference: number | null;
  cth_explanation: number | null;
  cth_self_regulation: number | null;
  evidenceSummary: string | null;
  confidence: number | null;
  source: string | null;
  createdAt: string | null;
  cognitiveDepthLevel: number | null;
}

// ─── Aggregation helpers ───────────────────────────────────────────────────────

function avgOrNull(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function groupBySequence(scores: RawScore[]): HeatmapEntry[] {
  return scores.map((s, idx) => ({
    groupKey: String(idx + 1),
    label: `#${idx + 1}`,
    ct_decomposition: s.ct_decomposition ?? null,
    ct_pattern_recognition: s.ct_pattern_recognition ?? null,
    ct_abstraction: s.ct_abstraction ?? null,
    ct_algorithm_design: s.ct_algorithm_design ?? null,
    ct_evaluation_debugging: s.ct_evaluation_debugging ?? null,
    ct_generalization: s.ct_generalization ?? null,
    cth_interpretation: s.cth_interpretation ?? null,
    cth_analysis: s.cth_analysis ?? null,
    cth_evaluation: s.cth_evaluation ?? null,
    cth_inference: s.cth_inference ?? null,
    cth_explanation: s.cth_explanation ?? null,
    cth_self_regulation: s.cth_self_regulation ?? null,
    evidenceSummary: s.evidence_summary,
    confidence: s.confidence ?? null,
    source: s.source,
    createdAt: s.created_at,
    cognitiveDepthLevel: s.cognitive_depth_level ?? null,
  }));
}

function groupByWeek(scores: RawScore[]): HeatmapEntry[] {
  const map = new Map<number, RawScore[]>();
  for (const s of scores) {
    const week = s.data_collection_week ?? 0;
    if (!map.has(week)) map.set(week, []);
    map.get(week)!.push(s);
  }
  const sorted = Array.from(map.entries()).sort(([a], [b]) => a - b);
  return sorted.map(([week, rows]) => buildAggEntry(`W${week}`, `Minggu ${week}`, rows));
}

function groupBySession(scores: RawScore[]): HeatmapEntry[] {
  const map = new Map<string, RawScore[]>();
  for (const s of scores) {
    const key = s.learning_session_id ?? 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  let idx = 1;
  const entries: HeatmapEntry[] = [];
  for (const [key, rows] of map.entries()) {
    entries.push(buildAggEntry(key, `Sesi ${idx}`, rows));
    idx++;
  }
  return entries;
}

function buildAggEntry(groupKey: string, label: string, rows: RawScore[]): HeatmapEntry {
  return {
    groupKey,
    label,
    ct_decomposition: avgOrNull(rows.map((r) => r.ct_decomposition)),
    ct_pattern_recognition: avgOrNull(rows.map((r) => r.ct_pattern_recognition)),
    ct_abstraction: avgOrNull(rows.map((r) => r.ct_abstraction)),
    ct_algorithm_design: avgOrNull(rows.map((r) => r.ct_algorithm_design)),
    ct_evaluation_debugging: avgOrNull(rows.map((r) => r.ct_evaluation_debugging)),
    ct_generalization: avgOrNull(rows.map((r) => r.ct_generalization)),
    cth_interpretation: avgOrNull(rows.map((r) => r.cth_interpretation)),
    cth_analysis: avgOrNull(rows.map((r) => r.cth_analysis)),
    cth_evaluation: avgOrNull(rows.map((r) => r.cth_evaluation)),
    cth_inference: avgOrNull(rows.map((r) => r.cth_inference)),
    cth_explanation: avgOrNull(rows.map((r) => r.cth_explanation)),
    cth_self_regulation: avgOrNull(rows.map((r) => r.cth_self_regulation)),
    evidenceSummary: rows.at(-1)?.evidence_summary ?? null,
    confidence: avgOrNull(rows.map((r) => r.confidence)),
    source: rows.at(-1)?.source ?? null,
    createdAt: rows.at(-1)?.created_at ?? null,
    cognitiveDepthLevel: avgOrNull(rows.map((r) => r.cognitive_depth_level)),
  };
}

// ─── Row totals / col totals ──────────────────────────────────────────────────

function computeRowTotals(entries: HeatmapEntry[]): Record<DimensionKey, number> {
  const totals = {} as Record<DimensionKey, number>;
  for (const key of DIMENSION_KEYS) {
    const vals = entries.map((e) => e[key]).filter((v): v is number => v !== null);
    totals[key] = vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0;
  }
  return totals;
}

function computeColTotals(entries: HeatmapEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const entry of entries) {
    const sum = DIMENSION_KEYS.reduce((acc, key) => acc + (entry[key] ?? 0), 0);
    totals[entry.groupKey] = Math.round(sum * 100) / 100;
  }
  return totals;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function getHandler(request: NextRequest) {
  const admin = verifyAdminFromCookie(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') ?? searchParams.get('user_id');
  const courseId = searchParams.get('courseId') ?? searchParams.get('course_id');
  const groupByParam = (searchParams.get('groupBy') ?? 'sequence') as GroupBy;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!userId) {
    return NextResponse.json({ error: 'Parameter userId diperlukan' }, { status: 400 });
  }

  const validGroupBy: GroupBy[] = ['sequence', 'week', 'session'];
  const groupBy: GroupBy = validGroupBy.includes(groupByParam) ? groupByParam : 'sequence';

  try {
    let query = adminDb
      .from('auto_cognitive_scores')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (courseId) query = query.eq('course_id', courseId);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;

    if (error) {
      console.error('[CognitiveScores] Query failed:', error);
      return NextResponse.json({ error: 'Gagal memuat data skor kognitif' }, { status: 500 });
    }

    const scores = (data ?? []) as RawScore[];

    if (scores.length === 0) {
      return NextResponse.json({
        success: true,
        entries: [],
        aggregateRowTotals: {},
        aggregateColTotals: {},
        groupBy,
        totalEntries: 0,
      });
    }

    let entries: HeatmapEntry[];
    switch (groupBy) {
      case 'week':
        entries = groupByWeek(scores);
        break;
      case 'session':
        entries = groupBySession(scores);
        break;
      default:
        entries = groupBySequence(scores);
    }

    const aggregateRowTotals = computeRowTotals(entries);
    const aggregateColTotals = computeColTotals(entries);

    return NextResponse.json({
      success: true,
      entries,
      aggregateRowTotals,
      aggregateColTotals,
      groupBy,
      totalEntries: scores.length,
    });
  } catch (err) {
    console.error('[CognitiveScores] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiLogging(getHandler, { label: 'admin.cognitive-scores' });
export const dynamic = 'force-dynamic';
