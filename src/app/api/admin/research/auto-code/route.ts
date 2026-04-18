/**
 * API Route: Stage 4 Research Auto-Coder
 * POST /api/admin/research/auto-code
 *
 * Runs RM2/RM3 automatic coding from research_evidence_items:
 * - RM2 prompt-stage classification
 * - RM3 12-indicator cognitive scoring
 * - automatic triangulation records, including "belum_muncul"
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { isUuid } from '@/lib/research-normalizers';
import { runResearchAutoCoder } from '@/services/research-auto-coder.service';

interface AutoCodeBody {
  user_id?: unknown;
  course_id?: unknown;
  learning_session_id?: unknown;
  session_id?: unknown;
  limit?: unknown;
  runtime_budget_ms?: unknown;
  dry_run?: unknown;
  include_reviewed?: unknown;
  run_triangulation?: unknown;
}

const DEFAULT_AUTO_CODE_LIMIT = 3;
const MAX_AUTO_CODE_LIMIT = 10;
const DEFAULT_RUNTIME_BUDGET_MS = 35_000;
const MAX_RUNTIME_BUDGET_MS = 50_000;

export const maxDuration = 55;

async function getHandler(request: NextRequest) {
  const admin = verifyAdminFromCookie(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10));
    const { data, error } = await adminDb
      .from('research_auto_coding_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[ResearchAutoCode] Run table unavailable:', error);
      return NextResponse.json({
        success: true,
        runs: [],
        message: 'Belum ada riwayat auto-coding atau migration tahap 4 belum diterapkan.',
      });
    }

    return NextResponse.json({ success: true, runs: data ?? [] });
  } catch (error) {
    console.error('Error in GET /api/admin/research/auto-code:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function postHandler(request: NextRequest) {
  const admin = verifyAdminFromCookie(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({})) as AutoCodeBody;
    const userId = readUuid(body.user_id);
    const courseId = readUuid(body.course_id);
    const learningSessionId = readUuid(body.learning_session_id ?? body.session_id);

    const result = await runResearchAutoCoder({
      userId,
      courseId,
      learningSessionId,
      limit: readLimit(body.limit),
      runtimeBudgetMs: readRuntimeBudgetMs(body.runtime_budget_ms),
      dryRun: readBoolean(body.dry_run, false),
      includeReviewed: readBoolean(body.include_reviewed, false),
      runTriangulation: readBoolean(body.run_triangulation, true),
      requestedBy: admin.userId,
      requestedByEmail: admin.email,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /api/admin/research/auto-code:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}

function readUuid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return isUuid(trimmed) ? trimmed : undefined;
}

function readLimit(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Math.min(MAX_AUTO_CODE_LIMIT, Math.max(1, Number.isFinite(parsed) ? parsed : DEFAULT_AUTO_CODE_LIMIT));
}

function readRuntimeBudgetMs(value: unknown): number {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Math.min(
    MAX_RUNTIME_BUDGET_MS,
    Math.max(10_000, Number.isFinite(parsed) ? parsed : DEFAULT_RUNTIME_BUDGET_MS)
  );
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
  }
  return fallback;
}

export const GET = withApiLogging(getHandler, { label: 'admin.research.auto-code.get' });
export const POST = withApiLogging(postHandler, { label: 'admin.research.auto-code.post', awaitLog: false });
