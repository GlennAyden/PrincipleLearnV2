import { randomUUID } from 'crypto';

export const PROMPT_STAGES = ['SCP', 'SRP', 'MQP', 'REFLECTIVE'] as const;
export type NormalizedPromptStage = typeof PROMPT_STAGES[number];

export const PROMPT_STAGE_SCORES: Record<NormalizedPromptStage, number> = {
  SCP: 1,
  SRP: 2,
  MQP: 3,
  REFLECTIVE: 4,
};

export const MICRO_MARKERS = ['GCP', 'PP', 'ARP'] as const;
export type NormalizedMicroMarker = typeof MICRO_MARKERS[number];

export type ResearchSourceType =
  | 'ask_question'
  | 'discussion'
  | 'challenge'
  | 'challenge_response'
  | 'quiz_submission'
  | 'journal'
  | 'artifact'
  | 'observation'
  | 'manual_entry'
  | 'manual_note';

export const EVIDENCE_SOURCE_TYPES = [
  'ask_question',
  'challenge_response',
  'quiz_submission',
  'journal',
  'discussion',
  'artifact',
  'observation',
  'manual_note',
] as const;
export type EvidenceSourceType = typeof EVIDENCE_SOURCE_TYPES[number];

export type TrajectoryStatus = 'naik_stabil' | 'stagnan' | 'fluktuatif' | 'anomali' | 'turun';

export function normalizePromptStage(value: unknown): NormalizedPromptStage {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'REFLEKTIF' || raw === 'REFLECTIVE' || raw === 'REFLECTIF' || raw === 'REFLECTIVE_PROMPT') {
    return 'REFLECTIVE';
  }
  if (raw === 'SIMPLE' || raw === 'SIMPLE_CLARIFICATION_PROMPT') return 'SCP';
  if (raw === 'STRUCTURED' || raw === 'STRUCTURED_REFORMULATION_PROMPT') return 'SRP';
  if (raw === 'MULTI' || raw === 'MULTI_QUESTION_PROMPT') return 'MQP';
  if (PROMPT_STAGES.includes(raw as NormalizedPromptStage)) return raw as NormalizedPromptStage;
  return 'SCP';
}

export function getPromptStageScore(value: unknown): number {
  return PROMPT_STAGE_SCORES[normalizePromptStage(value)];
}

export function normalizeMicroMarkers(value: unknown): NormalizedMicroMarker[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? parseMarkerString(value)
      : value && typeof value === 'object'
        ? Object.keys(value as Record<string, unknown>)
        : [];

  const markers = rawValues
    .map((item) => String(item ?? '').trim().toUpperCase())
    .map((item) => item.includes(':') ? markerFromClassifierLabel(item) : item)
    .filter((item): item is NormalizedMicroMarker => MICRO_MARKERS.includes(item as NormalizedMicroMarker));

  return Array.from(new Set(markers));
}

export function normalizeSourceType(value: unknown): ResearchSourceType {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'challenge') return 'challenge_response';
  if (raw === 'refleksi' || raw === 'reflection') return 'journal';
  if (raw === 'manual' || raw === 'manual_coding') return 'manual_entry';
  if (raw === 'note' || raw === 'manual_note') return 'manual_note';
  const allowed: ResearchSourceType[] = [
    'ask_question',
    'discussion',
    'challenge',
    'challenge_response',
    'quiz_submission',
    'journal',
    'artifact',
    'observation',
    'manual_entry',
    'manual_note',
  ];
  return allowed.includes(raw as ResearchSourceType) ? raw as ResearchSourceType : 'manual_entry';
}

export function normalizeScore(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(2, Math.round(parsed)));
}

export function normalizeDepth(value: unknown, fallback = 1): 1 | 2 | 3 | 4 {
  const parsed = typeof value === 'number' ? value : Number(value);
  const clamped = Math.max(1, Math.min(4, Math.round(Number.isFinite(parsed) ? parsed : fallback)));
  return clamped as 1 | 2 | 3 | 4;
}

export function normalizeConfidence(value: unknown, fallback = 0.8): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
}

export function coerceUuid(value: unknown): string {
  const raw = String(value ?? '').trim();
  return isUuid(raw) ? raw : randomUUID();
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function determineTrajectoryStatus(scores: number[]): TrajectoryStatus {
  const validScores = scores.filter((score) => Number.isFinite(score));
  if (validScores.length < 2) return 'stagnan';

  const transitions = validScores.slice(1).map((score, index) => score - validScores[index]);
  const hasIncrease = transitions.some((transition) => transition > 0);
  const hasDecrease = transitions.some((transition) => transition < 0);
  const zeroCount = transitions.filter((transition) => transition === 0).length;

  if (hasIncrease && !hasDecrease) return zeroCount >= transitions.length - 1 ? 'stagnan' : 'naik_stabil';
  if (!hasIncrease && hasDecrease) return 'turun';
  if (hasIncrease && hasDecrease) return 'fluktuatif';
  return 'stagnan';
}

export function getWeekBucket(dateValue: unknown, startDate?: Date | null): string {
  const date = new Date(String(dateValue ?? ''));
  if (Number.isNaN(date.getTime())) return 'Minggu Tidak Diketahui';

  const anchor = startDate && !Number.isNaN(startDate.getTime())
    ? new Date(startDate)
    : new Date(date.getFullYear(), date.getMonth(), date.getDate());
  anchor.setHours(0, 0, 0, 0);

  const current = new Date(date);
  current.setHours(0, 0, 0, 0);
  const diffDays = Math.max(0, Math.floor((current.getTime() - anchor.getTime()) / 86400000));
  return `Minggu ${Math.floor(diffDays / 7) + 1}`;
}

export function formatAnonParticipant(index: number): string {
  return `S${String(index + 1).padStart(2, '0')}`;
}

function parseMarkerString(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed && typeof parsed === 'object') return Object.keys(parsed);
  } catch {
    // fall through
  }
  return trimmed.split(/[,;\s]+/).filter(Boolean);
}

function markerFromClassifierLabel(value: string): string {
  if (value.includes('REASONING') || value.includes('REFLECTIVE') || value.includes('EVALUASI')) return 'ARP';
  if (value.includes('TUJUAN') || value.includes('KONTEKS') || value.includes('CONTEXT')) return 'GCP';
  if (value.includes('BATASAN') || value.includes('PROCEDURAL') || value.includes('LANGKAH')) return 'PP';
  return value;
}
