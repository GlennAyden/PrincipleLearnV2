/**
 * GET /api/admin/research/irr/kappa
 *
 * Computes live Cohen's kappa for the IRR double-coding workflow (MVR Item 8d).
 * Logic ported from scripts/irr-compute-kappa.mjs so it can be called from
 * the rater UI after each submit without a Node CLI round-trip.
 *
 * Returns:
 *   { kappa, po, pe, n, ratedCount, targetCount, agreement: 'substantial'|'moderate'|'poor' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';

const STAGES = ['SCP', 'SRP', 'MQP', 'REFLECTIVE'] as const;
const IRR_TARGET = 30; // target sample size declared in CODEBOOK

/**
 * Cohen's κ for an overall 4-category classification.
 * pairs: array of [rater1Stage, rater2Stage]
 */
function cohensKappa(
  categories: readonly string[],
  pairs: Array<[string, string]>,
): { kappa: number; po: number; pe: number; n: number } {
  if (pairs.length === 0) return { kappa: 0, po: 0, pe: 0, n: 0 };

  const n = pairs.length;
  let agree = 0;
  const m1: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));
  const m2: Record<string, number> = Object.fromEntries(categories.map((c) => [c, 0]));

  for (const [a, b] of pairs) {
    if (a === b) agree += 1;
    if (a in m1) m1[a] += 1;
    if (b in m2) m2[b] += 1;
  }

  const po = agree / n;
  let pe = 0;
  for (const c of categories) {
    pe += (m1[c] / n) * (m2[c] / n);
  }

  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  return { kappa: Math.round(kappa * 1000) / 1000, po, pe, n };
}

async function getHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch secondary (researcher_2) rows with their primary stage for pairing.
  const { data: secondary, error: sErr } = await adminDb
    .from('prompt_classifications')
    .select('id, prompt_stage, secondary_classification_id')
    .eq('classified_by', 'researcher_2')
    .eq('mode', 'research')
    .not('secondary_classification_id', 'is', 'null');

  if (sErr) {
    console.error('[irr/kappa] fetch secondary failed', sErr);
    return NextResponse.json({ error: 'Gagal mengambil data IRR.' }, { status: 500 });
  }

  const rows = (secondary ?? []) as Array<{ id: string; prompt_stage: string; secondary_classification_id: string | null }>;
  if (rows.length === 0) {
    return NextResponse.json({
      kappa: 0,
      po: 0,
      pe: 0,
      n: 0,
      ratedCount: 0,
      targetCount: IRR_TARGET,
      agreement: 'poor' as const,
    });
  }

  // Resolve primary stages in one query.
  const primaryIds = rows
    .map((r) => r.secondary_classification_id as string)
    .filter(Boolean);

  const { data: primary, error: pErr } = await adminDb
    .from('prompt_classifications')
    .select('id, prompt_stage')
    .in('id', primaryIds);

  if (pErr) {
    console.error('[irr/kappa] fetch primary failed', pErr);
    return NextResponse.json({ error: 'Gagal mengambil data klasifikasi primer.' }, { status: 500 });
  }

  const stageById = new Map<string, string>(
    ((primary ?? []) as Array<{ id: string; prompt_stage: string }>).map((r) => [
      r.id,
      r.prompt_stage,
    ]),
  );

  // Build pairs [primaryStage, secondaryStage].
  const pairs: Array<[string, string]> = [];
  for (const sec of rows) {
    const primStage = stageById.get(sec.secondary_classification_id as string);
    if (primStage && sec.prompt_stage) {
      pairs.push([primStage, sec.prompt_stage as string]);
    }
  }

  const result = cohensKappa(STAGES, pairs);

  const agreement =
    result.kappa >= 0.75
      ? ('substantial' as const)
      : result.kappa >= 0.41
        ? ('moderate' as const)
        : ('poor' as const);

  return NextResponse.json({
    ...result,
    ratedCount: rows.length,
    targetCount: IRR_TARGET,
    agreement,
  });
}

export const GET = withApiLogging(getHandler, { label: 'admin-research-irr-kappa' });
