/**
 * API Route: Single Triangulation Record
 * GET  /api/admin/research/triangulation/[id] — fetch detail with joined user + course
 * PATCH /api/admin/research/triangulation/[id] — update researcher_notes only
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';
import { isUuid } from '@/lib/research-normalizers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface TriangulationDetailRow {
  id: string;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  prompt_classification_id?: string | null;
  finding_type?: string | null;
  finding_description?: string | null;
  log_evidence?: string | null;
  log_evidence_status?: string | null;
  observation_evidence?: string | null;
  observation_evidence_status?: string | null;
  artifact_evidence?: string | null;
  artifact_evidence_status?: string | null;
  interview_evidence?: string | null;
  interview_evidence_status?: string | null;
  convergence_status?: string | null;
  convergence_score?: number | null;
  rm_focus?: string | null;
  indicator_code?: string | null;
  triangulation_status?: string | null;
  sources?: Record<string, unknown> | null;
  evidence_excerpt?: string | null;
  final_decision?: string | null;
  decision_rationale?: string | null;
  researcher_notes?: string | null;
  auto_generated?: boolean | null;
  review_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const guard = assertResearchModeOnly(request);
    if (guard) return guard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 });
    }

    const { data: record, error: recordError } = await adminDb
      .from('triangulation_records')
      .select('*')
      .eq('id', id)
      .single();

    if (recordError || !record) {
      return NextResponse.json({ error: 'Catatan triangulasi tidak ditemukan' }, { status: 404 });
    }

    const row = record as TriangulationDetailRow;

    // Fetch joined user info
    const [{ data: userData }, { data: courseData }] = await Promise.all([
      row.user_id
        ? adminDb.from('users').select('id, name, email').eq('id', row.user_id).single()
        : Promise.resolve({ data: null }),
      row.course_id
        ? adminDb.from('courses').select('id, title').eq('id', row.course_id).single()
        : Promise.resolve({ data: null }),
    ]);

    const user = userData as { id: string; name?: string | null; email?: string | null } | null;
    const course = courseData as { id: string; title?: string | null } | null;

    return NextResponse.json({
      success: true,
      record: {
        ...row,
        student_name: user?.name ?? user?.email ?? 'Siswa tanpa nama',
        student_email: user?.email ?? null,
        course_title: course?.title ?? null,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/admin/research/triangulation/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const guard = requireAdminMutation(request);
    if (guard) return guard;

    const modeGuard = assertResearchModeOnly(request);
    if (modeGuard) return modeGuard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    if (!id || !isUuid(id)) {
      return NextResponse.json({ error: 'ID tidak valid' }, { status: 400 });
    }

    const body = await request.json() as { researcher_notes?: string };

    if (typeof body.researcher_notes !== 'string' && body.researcher_notes !== null && body.researcher_notes !== undefined) {
      return NextResponse.json({ error: 'Field researcher_notes harus berupa teks' }, { status: 400 });
    }

    const { error } = await adminDb
      .from('triangulation_records')
      .eq('id', id)
      .update({
        researcher_notes: body.researcher_notes ?? null,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error updating researcher_notes:', error);
      return NextResponse.json({ error: 'Gagal menyimpan catatan peneliti' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Catatan peneliti berhasil disimpan' });
  } catch (error) {
    console.error('Error in PATCH /api/admin/research/triangulation/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
