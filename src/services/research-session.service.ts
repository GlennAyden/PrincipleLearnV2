import { adminDb } from '@/lib/database';
import {
  getWeekBucket,
  isUuid,
  type EvidenceSourceType,
  type NormalizedPromptStage,
} from '@/lib/research-normalizers';

export interface ResearchSessionResolution {
  learningSessionId: string | null;
  sessionNumber: number;
  dataCollectionWeek: string | null;
}

export interface ResolveResearchSessionInput {
  userId: string;
  courseId: string;
  sessionNumber?: number | null;
  occurredAt?: string | Date | null;
}

export interface ResearchEvidenceSyncInput {
  sourceType: EvidenceSourceType;
  sourceId: string | null | undefined;
  sourceTable: string;
  userId: string;
  courseId?: string | null;
  learningSessionId?: string | null;
  rmFocus?: 'RM2' | 'RM3' | 'RM2_RM3';
  indicatorCode?: string | null;
  promptStage?: NormalizedPromptStage | string | null;
  unitSequence?: number | null;
  evidenceTitle?: string | null;
  evidenceText?: string | null;
  aiResponseText?: string | null;
  artifactText?: string | null;
  evidenceStatus?: 'raw' | 'coded' | 'triangulated' | 'excluded' | 'needs_review';
  codingStatus?: 'uncoded' | 'auto_coded' | 'manual_coded' | 'reviewed';
  researchValidityStatus?: 'valid' | 'low_information' | 'duplicate' | 'excluded' | 'manual_note';
  triangulationStatus?: 'kuat' | 'sebagian' | 'bertentangan' | 'belum_muncul' | null;
  dataCollectionWeek?: string | null;
  autoConfidence?: number | null;
  evidenceSourceSummary?: string | null;
  researcherNotes?: string | null;
  rawEvidenceSnapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

interface LearningSessionRow {
  id?: string;
  session_number?: number | null;
  session_date?: string | null;
  session_start?: string | null;
  created_at?: string | null;
  data_collection_week?: string | null;
}

interface EvidenceItemRow {
  id?: string;
  evidence_status?: string | null;
  coding_status?: string | null;
  research_validity_status?: string | null;
  researcher_notes?: string | null;
  metadata?: unknown;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function toIso(value: string | Date | null | undefined): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function normalizePositiveInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function validConfidence(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
}

function preserveEvidenceStatus(existing: unknown, next: ResearchEvidenceSyncInput['evidenceStatus']) {
  if (existing === 'triangulated' || existing === 'excluded') return existing;
  return next ?? existing ?? 'raw';
}

function preserveCodingStatus(existing: unknown, next: ResearchEvidenceSyncInput['codingStatus']) {
  if (existing === 'manual_coded' || existing === 'reviewed') return existing;
  return next ?? existing ?? 'uncoded';
}

function preserveValidityStatus(existing: unknown, next: ResearchEvidenceSyncInput['researchValidityStatus']) {
  if (existing === 'excluded' || existing === 'manual_note' || existing === 'duplicate') {
    return existing;
  }
  return next ?? existing ?? 'valid';
}

async function getEarliestSessionDate(userId: string, courseId: string): Promise<Date | null> {
  const { data } = await adminDb
    .from('learning_sessions')
    .select('session_date, session_start, created_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .order('session_date', { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = data as LearningSessionRow | null;
  const rawDate = row?.session_date ?? row?.session_start ?? row?.created_at ?? null;
  if (!rawDate) return null;

  const parsed = new Date(rawDate);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

async function resolveSessionNumber(input: ResolveResearchSessionInput, occurredAtIso: string): Promise<number> {
  const requested = normalizePositiveInt(input.sessionNumber, 0);
  if (requested > 0) return requested;

  const { data: lastSession } = await adminDb
    .from('learning_sessions')
    .select('session_number, session_date, session_start, created_at')
    .eq('user_id', input.userId)
    .eq('course_id', input.courseId)
    .order('session_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = lastSession as LearningSessionRow | null;
  if (!row) return 1;

  const lastNumber = normalizePositiveInt(row.session_number, 1);
  const rawLastDate = row.session_start ?? row.created_at ?? row.session_date ?? null;
  const lastDate = rawLastDate ? new Date(rawLastDate) : null;
  const currentDate = new Date(occurredAtIso);

  if (lastDate && Number.isFinite(lastDate.getTime())) {
    const diffMs = currentDate.getTime() - lastDate.getTime();
    if (diffMs >= 0 && diffMs <= ONE_DAY_MS) return lastNumber;
  }

  return lastNumber + 1;
}

async function findLearningSession(
  userId: string,
  courseId: string,
  sessionNumber: number,
): Promise<LearningSessionRow | null> {
  const { data } = await adminDb
    .from('learning_sessions')
    .select('id, session_number, session_date, session_start, created_at, data_collection_week')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('session_number', sessionNumber)
    .maybeSingle();

  return (data as LearningSessionRow | null) ?? null;
}

export async function resolveResearchLearningSession(
  input: ResolveResearchSessionInput,
): Promise<ResearchSessionResolution> {
  const occurredAtIso = toIso(input.occurredAt);
  let sessionNumber = normalizePositiveInt(input.sessionNumber, 1);
  let dataCollectionWeek = getWeekBucket(occurredAtIso);

  try {
    sessionNumber = await resolveSessionNumber(input, occurredAtIso);
    const firstSessionDate = await getEarliestSessionDate(input.userId, input.courseId);
    dataCollectionWeek = getWeekBucket(occurredAtIso, firstSessionDate);

    const existing = await findLearningSession(input.userId, input.courseId, sessionNumber);
    if (existing?.id) {
      if (!existing.data_collection_week && dataCollectionWeek) {
        await adminDb
          .from('learning_sessions')
          .eq('id', existing.id)
          .update({
            data_collection_week: dataCollectionWeek,
            last_research_sync_at: new Date().toISOString(),
          });
      }

      return {
        learningSessionId: existing.id,
        sessionNumber,
        dataCollectionWeek: existing.data_collection_week ?? dataCollectionWeek,
      };
    }

    const { data: inserted, error: insertError } = await adminDb
      .from('learning_sessions')
      .insert({
        user_id: input.userId,
        course_id: input.courseId,
        session_number: sessionNumber,
        session_date: dateOnly(occurredAtIso),
        session_start: occurredAtIso,
        total_prompts: 0,
        total_revisions: 0,
        is_valid_for_analysis: true,
        data_collection_week: dataCollectionWeek,
        readiness_status: 'perlu_data',
        readiness_score: 0,
        evidence_summary: {},
        last_research_sync_at: occurredAtIso,
      });

    if (!insertError && inserted && typeof inserted.id === 'string') {
      return {
        learningSessionId: inserted.id,
        sessionNumber,
        dataCollectionWeek,
      };
    }

    const racedSession = await findLearningSession(input.userId, input.courseId, sessionNumber);
    return {
      learningSessionId: racedSession?.id ?? null,
      sessionNumber,
      dataCollectionWeek: racedSession?.data_collection_week ?? dataCollectionWeek,
    };
  } catch (error) {
    console.warn('[ResearchSession] Failed to resolve learning session; continuing without link', error);
    return {
      learningSessionId: null,
      sessionNumber,
      dataCollectionWeek,
    };
  }
}

export async function refreshResearchSessionMetrics(learningSessionId: string | null | undefined): Promise<void> {
  if (!learningSessionId || !isUuid(learningSessionId)) return;

  try {
    const { error } = await adminDb.rpc('refresh_learning_session_research_metrics', {
      p_session_id: learningSessionId,
    });
    if (error) {
      console.warn('[ResearchSession] Failed to refresh session metrics', error);
    }
  } catch (error) {
    console.warn('[ResearchSession] refresh metrics skipped', error);
  }
}

export async function syncResearchEvidenceItem(input: ResearchEvidenceSyncInput): Promise<string | null> {
  if (!input.sourceId || !isUuid(input.sourceId)) {
    return null;
  }

  const now = new Date().toISOString();

  try {
    const { data: existingData } = await adminDb
      .from('research_evidence_items')
      .select('id, evidence_status, coding_status, research_validity_status, researcher_notes, metadata')
      .eq('source_type', input.sourceType)
      .eq('source_table', input.sourceTable)
      .eq('source_id', input.sourceId)
      .maybeSingle();

    const existing = existingData as EvidenceItemRow | null;
    const metadata = {
      ...asRecord(existing?.metadata),
      ...asRecord(input.metadata),
      last_auto_sync_at: now,
    };

    const payload = {
      source_type: input.sourceType,
      source_id: input.sourceId,
      source_table: input.sourceTable,
      user_id: input.userId,
      course_id: input.courseId ?? null,
      learning_session_id: input.learningSessionId ?? null,
      rm_focus: input.rmFocus ?? 'RM2_RM3',
      indicator_code: input.indicatorCode ?? null,
      prompt_stage: input.promptStage ?? null,
      unit_sequence: input.unitSequence ?? null,
      evidence_title: input.evidenceTitle ?? null,
      evidence_text: input.evidenceText ?? null,
      ai_response_text: input.aiResponseText ?? null,
      artifact_text: input.artifactText ?? null,
      evidence_status: preserveEvidenceStatus(existing?.evidence_status, input.evidenceStatus),
      coding_status: preserveCodingStatus(existing?.coding_status, input.codingStatus),
      research_validity_status: preserveValidityStatus(
        existing?.research_validity_status,
        input.researchValidityStatus,
      ),
      triangulation_status: input.triangulationStatus ?? null,
      data_collection_week: input.dataCollectionWeek ?? null,
      auto_confidence: validConfidence(input.autoConfidence),
      evidence_source_summary: input.evidenceSourceSummary ?? null,
      researcher_notes: existing?.researcher_notes ?? input.researcherNotes ?? null,
      raw_evidence_snapshot: input.rawEvidenceSnapshot ?? {},
      metadata,
      is_auto_generated: true,
      updated_at: now,
    };

    if (existing?.id) {
      const { error: updateError } = await adminDb
        .from('research_evidence_items')
        .eq('id', existing.id)
        .update(payload);

      if (updateError) {
        console.warn('[ResearchSession] Failed to update research evidence item', updateError);
        return null;
      }

      return existing.id;
    }

    const { data: inserted, error: insertError } = await adminDb
      .from('research_evidence_items')
      .insert({
        ...payload,
        created_at: input.createdAt ?? now,
      });

    if (insertError) {
      console.warn('[ResearchSession] Failed to insert research evidence item', insertError);
      return null;
    }

    return typeof inserted?.id === 'string' ? inserted.id : null;
  } catch (error) {
    console.warn('[ResearchSession] Evidence sync failed; source row is preserved', error);
    return null;
  }
}
