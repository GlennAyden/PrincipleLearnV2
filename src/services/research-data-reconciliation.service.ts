import { adminDb } from '@/lib/database';
import { getWeekBucket, isUuid } from '@/lib/research-normalizers';
import {
  refreshResearchSessionMetrics,
  resolveResearchLearningSession,
} from '@/services/research-session.service';

export interface ResearchReconciliationInput {
  dryRun?: boolean;
  limit?: number;
  userId?: string | null;
  courseId?: string | null;
  requestedBy?: string | null;
}

export interface ResearchReconciliationResult {
  success: true;
  dry_run: boolean;
  scanned: number;
  candidates: number;
  updated_evidence: number;
  updated_sources: number;
  linked_sessions: number;
  skipped: number;
  skipped_reasons: Record<string, number>;
  week_buckets: Record<string, number>;
  source_types: Record<string, number>;
  sample: ReconciliationSample[];
  message: string;
}

interface EvidenceReconciliationRow {
  id: string;
  user_id?: string | null;
  course_id?: string | null;
  learning_session_id?: string | null;
  data_collection_week?: string | null;
  created_at?: string | null;
  source_type?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface ReconciliationSample {
  evidence_id: string;
  user_id?: string | null;
  course_id?: string | null;
  source_type?: string | null;
  source_table?: string | null;
  needs_session: boolean;
  needs_week: boolean;
  resolved_session_id?: string | null;
  resolved_week?: string | null;
  action: 'would_update' | 'updated' | 'skipped';
  reason?: string;
}

export async function runResearchDataReconciliation(input: ResearchReconciliationInput = {}): Promise<ResearchReconciliationResult> {
  const dryRun = input.dryRun !== false;
  const limit = Math.min(150, Math.max(1, Number(input.limit) || 50));
  const now = new Date().toISOString();

  let query = adminDb
    .from('research_evidence_items')
    .select('id, user_id, course_id, learning_session_id, data_collection_week, created_at, source_type, source_table, source_id, metadata')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (input.userId) query = query.eq('user_id', input.userId);
  if (input.courseId) query = query.eq('course_id', input.courseId);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal membaca research_evidence_items: ${error.message}`);
  }

  const rows = ((data ?? []) as EvidenceReconciliationRow[]);
  const candidates = rows.filter((row) => !row.learning_session_id || !row.data_collection_week);
  const collectionStart = getCollectionStart(rows);
  const skippedReasons: Record<string, number> = {};
  const weekBuckets: Record<string, number> = {};
  const sourceTypes: Record<string, number> = {};
  const sample: ReconciliationSample[] = [];
  const linkedSessionIds = new Set<string>();
  let updatedEvidence = 0;
  let updatedSources = 0;
  let skipped = 0;

  for (const row of candidates) {
    const needsSession = !row.learning_session_id;
    const needsWeek = !row.data_collection_week;
    const fallbackWeek = getWeekBucket(row.created_at, collectionStart);
    const sourceType = row.source_type || 'unknown';
    sourceTypes[sourceType] = (sourceTypes[sourceType] ?? 0) + 1;

    if (!row.user_id) {
      skipped += 1;
      addReason(skippedReasons, 'missing_user_id');
      pushSample(sample, row, needsSession, needsWeek, null, fallbackWeek, 'skipped', 'missing_user_id');
      continue;
    }

    let resolvedSessionId = row.learning_session_id ?? null;
    let resolvedWeek = row.data_collection_week ?? fallbackWeek;

    if (needsSession && row.course_id) {
      const resolution = await resolveResearchLearningSession({
        userId: row.user_id,
        courseId: row.course_id,
        occurredAt: row.created_at,
      });
      resolvedSessionId = resolution.learningSessionId;
      resolvedWeek = resolution.dataCollectionWeek ?? resolvedWeek;
    }

    if (resolvedWeek) {
      weekBuckets[resolvedWeek] = (weekBuckets[resolvedWeek] ?? 0) + 1;
    }

    if (needsSession && !resolvedSessionId) {
      skipped += 1;
      addReason(skippedReasons, row.course_id ? 'session_resolution_failed' : 'missing_course_id');
      pushSample(sample, row, needsSession, needsWeek, resolvedSessionId, resolvedWeek, 'skipped', row.course_id ? 'session_resolution_failed' : 'missing_course_id');
      continue;
    }

    if (dryRun) {
      pushSample(sample, row, needsSession, needsWeek, resolvedSessionId, resolvedWeek, 'would_update');
      continue;
    }

    const metadata = {
      ...(row.metadata && typeof row.metadata === 'object' ? row.metadata : {}),
      stage5_reconciled_at: now,
      stage5_reconciled_by: input.requestedBy ?? null,
    };
    const evidencePayload: Record<string, unknown> = {
      data_collection_week: resolvedWeek,
      metadata,
      updated_at: now,
    };
    if (resolvedSessionId) evidencePayload.learning_session_id = resolvedSessionId;

    const { error: updateError } = await adminDb
      .from('research_evidence_items')
      .eq('id', row.id)
      .update(evidencePayload);

    if (updateError) {
      skipped += 1;
      addReason(skippedReasons, 'evidence_update_failed');
      pushSample(sample, row, needsSession, needsWeek, resolvedSessionId, resolvedWeek, 'skipped', 'evidence_update_failed');
      continue;
    }

    updatedEvidence += 1;
    if (resolvedSessionId) linkedSessionIds.add(resolvedSessionId);
    const sourceUpdated = await updateSourceResearchLink(row, resolvedSessionId, resolvedWeek);
    if (sourceUpdated) updatedSources += 1;
    pushSample(sample, row, needsSession, needsWeek, resolvedSessionId, resolvedWeek, 'updated');
  }

  if (!dryRun && linkedSessionIds.size > 0) {
    await Promise.all(Array.from(linkedSessionIds).map((sessionId) => refreshResearchSessionMetrics(sessionId)));
  }

  return {
    success: true,
    dry_run: dryRun,
    scanned: rows.length,
    candidates: candidates.length,
    updated_evidence: updatedEvidence,
    updated_sources: updatedSources,
    linked_sessions: linkedSessionIds.size,
    skipped,
    skipped_reasons: skippedReasons,
    week_buckets: weekBuckets,
    source_types: sourceTypes,
    sample,
    message: dryRun
      ? `${candidates.length} evidence perlu rekonsiliasi. Jalankan apply untuk menulis session/week linkage.`
      : `${updatedEvidence} evidence direkonsiliasi dan ${linkedSessionIds.size} sesi tertaut.`,
  };
}

async function updateSourceResearchLink(
  row: EvidenceReconciliationRow,
  learningSessionId: string | null,
  dataCollectionWeek: string | null,
): Promise<boolean> {
  if (!row.source_table || !row.source_id || !isUuid(row.source_id)) return false;
  if (!learningSessionId && !dataCollectionWeek) return false;

  try {
    const payload: Record<string, unknown> = {};
    if (learningSessionId) payload.learning_session_id = learningSessionId;
    if (dataCollectionWeek) payload.data_collection_week = dataCollectionWeek;

    const { error } = await adminDb
      .from(row.source_table)
      .eq('id', row.source_id)
      .update(payload);

    return !error;
  } catch {
    return false;
  }
}

function getCollectionStart(rows: EvidenceReconciliationRow[]): Date | null {
  const dates = rows
    .map((row) => parseDate(row.created_at))
    .filter((date): date is Date => Boolean(date))
    .sort((a, b) => a.getTime() - b.getTime());

  return dates[0] ?? null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addReason(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

function pushSample(
  sample: ReconciliationSample[],
  row: EvidenceReconciliationRow,
  needsSession: boolean,
  needsWeek: boolean,
  resolvedSessionId: string | null,
  resolvedWeek: string | null,
  action: ReconciliationSample['action'],
  reason?: string,
): void {
  if (sample.length >= 12) return;
  sample.push({
    evidence_id: row.id,
    user_id: row.user_id,
    course_id: row.course_id,
    source_type: row.source_type,
    source_table: row.source_table,
    needs_session: needsSession,
    needs_week: needsWeek,
    resolved_session_id: resolvedSessionId,
    resolved_week: resolvedWeek,
    action,
    reason,
  });
}
