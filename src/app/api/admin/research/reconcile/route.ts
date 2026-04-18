/**
 * API Route: Stage 5 Research Data Reconciliation
 * POST /api/admin/research/reconcile
 *
 * Admin-only dry-run/apply endpoint to backfill learning session and weekly
 * collection links for historical research evidence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { isUuid } from '@/lib/research-normalizers';
import { runResearchDataReconciliation } from '@/services/research-data-reconciliation.service';

interface ReconcileBody {
  dry_run?: unknown;
  limit?: unknown;
  user_id?: unknown;
  course_id?: unknown;
}

const DEFAULT_RECONCILE_LIMIT = 50;
const MAX_RECONCILE_LIMIT = 150;

export const maxDuration = 55;

export async function POST(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({})) as ReconcileBody;
    const result = await runResearchDataReconciliation({
      dryRun: readBoolean(body.dry_run, true),
      limit: readLimit(body.limit),
      userId: readUuid(body.user_id),
      courseId: readUuid(body.course_id),
      requestedBy: admin.userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in POST /api/admin/research/reconcile:', error);
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
  return Math.min(MAX_RECONCILE_LIMIT, Math.max(1, Number.isFinite(parsed) ? parsed : DEFAULT_RECONCILE_LIMIT));
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
