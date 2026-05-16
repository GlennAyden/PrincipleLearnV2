import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyAdminFromCookie, requireAdminMutation } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';
import { IrrSubmitSchema, parseBody } from '@/lib/schemas';

/**
 * MVR Item 8d — receive an independent rater_2 classification for a prompt
 * that has already been classified by the primary rater. Writes:
 *   1) a new prompt_classifications row with classified_by='researcher_2'
 *      and secondary_classification_id pointing back to the primary row;
 *   2) a new cognitive_indicators row with assessed_by='researcher_2' linked
 *      to that secondary classification row.
 *
 * Idempotency note: the UNIQUE (prompt_source, prompt_id, classified_by)
 * constraint on prompt_classifications prevents accidental double-submit by
 * the same rater label; re-submission returns 409.
 */
async function postHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const authError = requireAdminMutation(req);
  if (authError) return authError;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = parseBody(IrrSubmitSchema, body);
  if (!parsed.success) return parsed.response;
  const { promptClassificationId, stage, scores, notes } = parsed.data;

  // 1. Resolve the primary classification — we copy its prompt_id /
  //    prompt_source / user_id / course_id onto the secondary row so the
  //    pair join works in scripts/irr-compute-kappa.mjs.
  const { data: primary, error: pErr } = await adminDb
    .from('prompt_classifications')
    .select('id, prompt_id, prompt_source, user_id, course_id, prompt_stage, mode')
    .eq('id', promptClassificationId)
    .single();

  if (pErr || !primary) {
    return NextResponse.json(
      { error: 'Primary classification tidak ditemukan untuk ID tersebut.' },
      { status: 404 },
    );
  }

  if (primary.mode !== 'research') {
    return NextResponse.json(
      { error: 'IRR hanya berlaku untuk klasifikasi Mode Penelitian.' },
      { status: 400 },
    );
  }

  // 2. Map UI stage → numeric score (matches docs/sql/create_research_tables.sql).
  const stageScoreMap: Record<typeof stage, number> = {
    SCP: 1,
    SRP: 2,
    MQP: 3,
    REFLECTIVE: 4,
  };

  // 3. Insert the secondary classification row. We deliberately set
  //    agreement_status here based on a simple stage comparison; the
  //    cohens-kappa script recomputes the canonical IRR metrics later.
  const agreementStatus = primary.prompt_stage === stage ? 'agreed' : 'disagreed';

  const { data: inserted, error: insErr } = await adminDb
    .from('prompt_classifications')
    .insert({
      prompt_source: primary.prompt_source,
      prompt_id: primary.prompt_id,
      user_id: primary.user_id,
      course_id: primary.course_id,
      prompt_text: '',
      prompt_stage: stage,
      prompt_stage_score: stageScoreMap[stage],
      classified_by: 'researcher_2',
      classification_method: 'manual_coding',
      secondary_classification_id: primary.id,
      agreement_status: agreementStatus,
      researcher_notes: notes ?? null,
      mode: 'research',
    });

  if (insErr) {
    const pgErr = insErr as { code?: string; message?: string };
    // Duplicate (prompt_source, prompt_id, classified_by) → 409.
    if (pgErr.code === '23505') {
      return NextResponse.json(
        { error: 'researcher_2 sudah pernah menilai prompt ini.' },
        { status: 409 },
      );
    }
    console.error('[irr/submit] insert classification failed', insErr);
    return NextResponse.json(
      { error: `Gagal menyimpan klasifikasi: ${pgErr.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  const insertedRow = inserted as { id: string } | null;
  if (!insertedRow?.id) {
    return NextResponse.json(
      { error: 'Insert berhasil tetapi tidak mengembalikan ID klasifikasi.' },
      { status: 500 },
    );
  }

  // 4. Insert cognitive_indicators row tied to the new secondary classification.
  const { error: ciErr } = await adminDb.from('cognitive_indicators').insert({
    prompt_classification_id: insertedRow.id,
    prompt_id: primary.prompt_id,
    user_id: primary.user_id,
    ...scores,
    assessed_by: 'researcher_2',
    assessment_method: 'manual_rubric',
    indicator_notes: notes ?? null,
  });

  if (ciErr) {
    const pgErr = ciErr as { message?: string };
    console.error('[irr/submit] insert cognitive_indicators failed', ciErr);
    return NextResponse.json(
      {
        error: `Klasifikasi tersimpan tetapi gagal menyimpan skor: ${pgErr.message ?? 'unknown'}`,
        partialSuccess: true,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    secondaryClassificationId: insertedRow.id,
    agreementStatus,
  });
}

export const POST = withApiLogging(postHandler, { label: 'admin-research-irr-submit' });
