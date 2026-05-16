/**
 * MVR Item 8a — write a `prompt_revisions` row whenever ask-question logs a
 * follow-up prompt. Schema requires (user_id, episode_id, original_prompt_id,
 * current_prompt_id, revision_sequence). We trace the chain back to the
 * episode root (first prompt without a follow_up_of) and number this revision.
 *
 * Heuristic revision_type: lightweight keyword classification on the new
 * prompt text — avoids a per-revision OpenAI call. Researcher can override
 * downstream via the admin UI if needed (Item 8 admin tools deferred to W12).
 */

import { adminDb } from '@/lib/database';

export type RevisionType =
  | 'clarification'
  | 'elaboration'
  | 'correction'
  | 'refinement'
  | 'follow_up';

const CLARIFY_PATTERNS = [/^apa\b/i, /maksudnya/i, /jelaskan/i, /tolong jelas/i];
const ELABORATE_PATTERNS = [/\blebih\b/i, /lengkap/i, /detail/i, /contoh lain/i, /tambah/i];
const CORRECT_PATTERNS = [/\bsalah\b/i, /\bkeliru\b/i, /\bperbaiki\b/i, /\bbetul/i, /\bbenar\b/i];
const REFINE_PATTERNS = [/\bspesifik\b/i, /\bfokus\b/i, /\bsempitkan\b/i, /\bbatas\b/i];

export function classifyRevisionType(promptText: string): RevisionType {
  const t = (promptText ?? '').trim();
  if (!t) return 'follow_up';
  if (CORRECT_PATTERNS.some((r) => r.test(t))) return 'correction';
  if (CLARIFY_PATTERNS.some((r) => r.test(t))) return 'clarification';
  if (REFINE_PATTERNS.some((r) => r.test(t))) return 'refinement';
  if (ELABORATE_PATTERNS.some((r) => r.test(t))) return 'elaboration';
  return 'follow_up';
}

interface AskHistoryAncestor {
  id: string;
  prompt_stage?: string | null;
  follow_up_of?: string | null;
}

/**
 * Walk back to the episode root. Caps at 6 hops to avoid pathological loops
 * (a corrupt chain should still fail closed; we just label the deepest known
 * row as the root rather than 500-ing the parent insert).
 */
async function traceEpisodeRoot(seedId: string): Promise<{ rootId: string; depth: number }> {
  let currentId = seedId;
  let depth = 0;
  while (depth < 6) {
    const { data } = await adminDb
      .from('ask_question_history')
      .select('id, follow_up_of')
      .eq('id', currentId)
      .maybeSingle();
    const row = (data as AskHistoryAncestor | null) ?? null;
    if (!row?.follow_up_of) return { rootId: currentId, depth };
    currentId = row.follow_up_of;
    depth += 1;
  }
  return { rootId: currentId, depth };
}

async function countExistingRevisions(episodeId: string): Promise<number> {
  const { data } = await adminDb
    .from('prompt_revisions')
    .select('id')
    .eq('episode_id', episodeId);
  return Array.isArray(data) ? data.length : 0;
}

export interface RecordPromptRevisionInputs {
  userId: string;
  learningSessionId: string | null;
  currentPromptId: string;
  previousPromptId: string;
  previousStage?: string | null;
  currentStage?: string | null;
  currentPromptText: string;
  episodeTopic?: string | null;
}

/**
 * Insert one row into `prompt_revisions`. Designed to be called inside the
 * background `void (async () => { ... })()` block in ask-question's
 * onComplete so a slow DB write never blocks the SSE stream finalization.
 * Failure is non-blocking: warned to console + a row written to api_logs
 * upstream by the caller, but never throws.
 */
export async function recordPromptRevision(inputs: RecordPromptRevisionInputs): Promise<void> {
  try {
    const { rootId: episodeId } = await traceEpisodeRoot(inputs.previousPromptId);
    const existingCount = await countExistingRevisions(episodeId);
    const revisionSequence = existingCount + 1;

    const previousStage = inputs.previousStage ?? null;
    const currentStage = inputs.currentStage ?? null;
    const stageImproved = previousStage && currentStage
      ? promptStageOrder(currentStage) > promptStageOrder(previousStage)
      : null;

    const { error } = await adminDb.from('prompt_revisions').insert({
      user_id: inputs.userId,
      learning_session_id: inputs.learningSessionId,
      episode_id: episodeId,
      episode_topic: inputs.episodeTopic ?? null,
      original_prompt_id: episodeId,
      current_prompt_id: inputs.currentPromptId,
      previous_prompt_id: inputs.previousPromptId,
      revision_sequence: revisionSequence,
      revision_type: classifyRevisionType(inputs.currentPromptText),
      quality_change: null,
      previous_stage: previousStage,
      current_stage: currentStage,
      stage_improved: stageImproved,
      revision_notes: null,
    });

    if (error) {
      console.warn('[prompt-revisions] insert failed (non-blocking)', error);
    }
  } catch (error) {
    console.warn('[prompt-revisions] traceEpisodeRoot failed (non-blocking)', error);
  }
}

// Canonical stage ranking — matches the SCP→SRP→MQP→Reflektif progression in
// the codebook. Higher number = more sophisticated prompt construction.
function promptStageOrder(stage: string): number {
  const normalized = stage.trim().toLowerCase();
  if (normalized.includes('reflekt')) return 4;
  if (normalized.includes('mqp')) return 3;
  if (normalized.includes('srp')) return 2;
  if (normalized.includes('scp')) return 1;
  return 0;
}
