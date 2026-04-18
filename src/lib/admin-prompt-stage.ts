import {
  getPromptStageScore,
  normalizePromptStage,
  PROMPT_STAGES,
  type NormalizedPromptStage,
} from '@/lib/research-normalizers'

export type AdminPromptStage = NormalizedPromptStage | 'N/A'

export interface PromptStageEvidenceRow {
  prompt_stage?: unknown
  prompt_stage_score?: unknown
  prompt_components?: unknown
  created_at?: string | null
}

export interface DeriveAdminPromptStageInput {
  classifications?: PromptStageEvidenceRow[]
  prompts?: PromptStageEvidenceRow[]
  interactionCount?: number
  fallback?: AdminPromptStage
}

export type PromptStageDistribution = Record<NormalizedPromptStage, number>

export function emptyPromptStageDistribution(initial = 0): PromptStageDistribution {
  return { SCP: initial, SRP: initial, MQP: initial, REFLECTIVE: initial }
}

export function countPromptComponents(value: unknown): number {
  const components = parsePromptComponents(value)
  if (!components) return 0

  return ['tujuan', 'konteks', 'batasan'].reduce((count, key) => {
    const field = components[key]
    return field !== undefined && field !== null && String(field).trim().length > 0
      ? count + 1
      : count
  }, 0)
}

export function classifyPromptComponents(value: unknown): NormalizedPromptStage {
  const count = countPromptComponents(value)

  if (count >= 3) return 'REFLECTIVE'
  if (count >= 2) return 'MQP'
  if (count >= 1) return 'SRP'
  return 'SCP'
}

export function deriveStageFromInteractionCount(count: number, fallback: AdminPromptStage = 'N/A'): AdminPromptStage {
  if (count >= 15) return 'REFLECTIVE'
  if (count >= 8) return 'MQP'
  if (count >= 3) return 'SRP'
  if (count >= 1) return 'SCP'
  return fallback
}

export function deriveAdminPromptStage(input: DeriveAdminPromptStageInput): AdminPromptStage {
  const fallback = input.fallback ?? 'N/A'
  const latestClassification = latestWithStage(input.classifications ?? [])
  if (latestClassification?.prompt_stage) {
    return normalizePromptStage(latestClassification.prompt_stage)
  }

  const latestPromptStage = latestWithStage(input.prompts ?? [])
  if (latestPromptStage?.prompt_stage) {
    return normalizePromptStage(latestPromptStage.prompt_stage)
  }

  const latestPromptWithComponents = latestRow(
    (input.prompts ?? []).filter((row) => countPromptComponents(row.prompt_components) > 0),
  )
  if (latestPromptWithComponents) {
    return classifyPromptComponents(latestPromptWithComponents.prompt_components)
  }

  const count = input.interactionCount ?? (input.prompts ?? []).length
  return deriveStageFromInteractionCount(count, fallback)
}

export function addStageToDistribution(
  distribution: PromptStageDistribution,
  value: unknown,
  increment = 1,
): void {
  const stage = normalizePromptStage(value)
  distribution[stage] += increment
}

export function averagePromptStageScore(rows: PromptStageEvidenceRow[]): number {
  if (rows.length === 0) return 0
  const total = rows.reduce((sum, row) => {
    const score = Number(row.prompt_stage_score)
    return sum + (Number.isFinite(score) && score > 0
      ? score
      : getPromptStageScore(row.prompt_stage))
  }, 0)
  return Math.round((total / rows.length) * 100) / 100
}

export function promptStages(): readonly NormalizedPromptStage[] {
  return PROMPT_STAGES
}

function parsePromptComponents(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string' || value.trim().length === 0) return null

  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function latestWithStage(rows: PromptStageEvidenceRow[]): PromptStageEvidenceRow | null {
  return latestRow(rows.filter((row) => row.prompt_stage !== undefined && row.prompt_stage !== null && String(row.prompt_stage).trim()))
}

function latestRow<T extends { created_at?: string | null }>(rows: T[]): T | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => toTime(b.created_at) - toTime(a.created_at))[0]
}

function toTime(value: unknown): number {
  if (typeof value !== 'string') return 0
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}
