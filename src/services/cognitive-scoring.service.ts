// src/services/cognitive-scoring.service.ts
// Unified CT/CrT scoring service — evaluates all interaction types
// against the 6+6 indicator taxonomy (aligned with cognitive_indicators DB schema)

import { openai, defaultOpenAIModel } from '@/lib/openai';
import { adminDb } from '@/lib/database';

// ── Types ────────────────────────────────────────────────��─────────

export type InteractionSource =
  | 'ask_question'
  | 'challenge_response'
  | 'quiz_submission'
  | 'journal'
  | 'discussion';

export interface CognitiveScores {
  ct_decomposition: number;
  ct_pattern_recognition: number;
  ct_abstraction: number;
  ct_algorithm_design: number;
  ct_evaluation_debugging: number;
  ct_generalization: number;
  ct_total: number;

  cth_interpretation: number;
  cth_analysis: number;
  cth_evaluation: number;
  cth_inference: number;
  cth_explanation: number;
  cth_self_regulation: number;
  cth_total: number;

  cognitive_depth_level: 1 | 2 | 3 | 4;
  confidence: number;
  evidence_summary: string;
}

export interface ScoringInput {
  source: InteractionSource;
  user_id: string;
  course_id: string;
  source_id: string;

  user_text: string;
  prompt_or_question: string;
  ai_response?: string;
  context_summary?: string;

  is_follow_up?: boolean;
  previous_interaction?: string;
  prompt_stage?: string;
  reflection_fields?: {
    understood?: string;
    confused?: string;
    strategy?: string;
    promptEvolution?: string;
  };
}

// ── Indicator relevance weights by source ──────────────────────────

interface IndicatorWeights {
  ct_primary: string[];
  ct_secondary: string[];
  crt_primary: string[];
  crt_secondary: string[];
}

const SOURCE_INDICATOR_WEIGHTS: Record<InteractionSource, IndicatorWeights> = {
  ask_question: {
    ct_primary: ['decomposition', 'abstraction'],
    ct_secondary: ['pattern_recognition', 'algorithm_design'],
    crt_primary: ['analysis', 'inference'],
    crt_secondary: ['evaluation', 'explanation'],
  },
  challenge_response: {
    ct_primary: ['algorithm_design', 'evaluation_debugging'],
    ct_secondary: ['decomposition', 'abstraction'],
    crt_primary: ['evaluation', 'explanation'],
    crt_secondary: ['analysis', 'inference'],
  },
  quiz_submission: {
    ct_primary: ['pattern_recognition', 'abstraction'],
    ct_secondary: ['decomposition'],
    crt_primary: ['interpretation', 'inference'],
    crt_secondary: ['analysis'],
  },
  journal: {
    ct_primary: ['generalization'],
    ct_secondary: ['abstraction', 'decomposition'],
    crt_primary: ['self_regulation', 'explanation'],
    crt_secondary: ['evaluation', 'interpretation'],
  },
  discussion: {
    ct_primary: ['decomposition', 'algorithm_design', 'abstraction'],
    ct_secondary: ['pattern_recognition', 'evaluation_debugging', 'generalization'],
    crt_primary: ['analysis', 'evaluation', 'inference'],
    crt_secondary: ['explanation', 'self_regulation', 'interpretation'],
  },
};

// ── System prompt builder ──────────────────────────────────────────

function buildScoringSystemPrompt(source: InteractionSource, weights: IndicatorWeights): string {
  const sourceLabels: Record<InteractionSource, string> = {
    ask_question: 'a student question submitted to an AI learning assistant',
    challenge_response: 'a student answer to a critical thinking challenge question',
    quiz_submission: 'student quiz answers with reasoning notes',
    journal: 'a student learning reflection/journal entry',
    discussion: 'a student response in a Socratic discussion session',
  };

  return `You are an educational assessment expert specializing in Computational Thinking (CT) and Critical Thinking (CrT) measurement in higher education contexts.

You will evaluate a student interaction from: ${sourceLabels[source]}.

## Scoring Rubric (0-2 scale per indicator)

### Computational Thinking (CT) — 6 indicators:
1. **ct_decomposition** (0-2): Breaking complex problems into smaller parts
   - 0: No evidence of decomposition
   - 1: Partial decomposition, mentions sub-parts but incompletely
   - 2: Clear decomposition into logical sub-components

2. **ct_pattern_recognition** (0-2): Identifying similarities/patterns across problems
   - 0: No pattern recognition
   - 1: Mentions similarities but doesn't apply them
   - 2: Explicitly identifies and uses patterns

3. **ct_abstraction** (0-2): Focusing on essential concepts, ignoring irrelevant details
   - 0: No abstraction, stays at surface level
   - 1: Some abstraction, identifies core concepts
   - 2: Clear abstraction with appropriate generalization

4. **ct_algorithm_design** (0-2): Constructing step-by-step solution procedures
   - 0: No algorithmic approach
   - 1: Mentions steps but lacks logical ordering
   - 2: Clear systematic procedure with logical sequence

5. **ct_evaluation_debugging** (0-2): Finding and correcting errors in reasoning
   - 0: No evaluation or error checking
   - 1: Some awareness of potential errors
   - 2: Active identification and correction of errors

6. **ct_generalization** (0-2): Applying solutions to broader contexts
   - 0: No generalization
   - 1: Hints at broader application
   - 2: Explicitly transfers solution to new contexts

### Critical Thinking (CrT) — 6 indicators:
1. **cth_interpretation** (0-2): Understanding meaning of data/situations
   - 0: No interpretation beyond surface reading
   - 1: Basic interpretation of information
   - 2: Deep interpretation with nuanced understanding

2. **cth_analysis** (0-2): Breaking down arguments to examine components
   - 0: No analytical approach
   - 1: Some analysis of key elements
   - 2: Systematic analysis of relationships and components

3. **cth_evaluation** (0-2): Assessing credibility and quality of arguments
   - 0: No evaluative judgment
   - 1: Basic assessment of correctness
   - 2: Critical evaluation with justified criteria

4. **cth_inference** (0-2): Drawing logical conclusions from evidence
   - 0: No logical inference
   - 1: Basic conclusions drawn
   - 2: Well-supported inferences from multiple evidence points

5. **cth_explanation** (0-2): Articulating reasoning and justification
   - 0: No explanation of reasoning
   - 1: Basic explanation of thought process
   - 2: Clear, justified explanation with supporting evidence

6. **cth_self_regulation** (0-2): Reflecting on own thinking and learning
   - 0: No metacognitive awareness
   - 1: Some awareness of own understanding/limitations
   - 2: Active reflection on learning process and strategy adjustment

## Cognitive Depth Levels (1-4):
1 = Descriptive (facts/definitions without elaboration)
2 = Early Analytical (comparing options, simple cause-effect)
3 = Analytical-Reflective (justification, evaluation, strategy revision)
4 = Deep Metacognitive (assumption verification, result validation, decision reflection)

## Focus indicators for this source type:
- CT primary focus: ${weights.ct_primary.join(', ')}
- CT secondary: ${weights.ct_secondary.join(', ')}
- CrT primary focus: ${weights.crt_primary.join(', ')}
- CrT secondary: ${weights.crt_secondary.join(', ')}

Indicators NOT in the primary/secondary lists should receive 0 unless there is clear evidence. Be conservative — only score 1 or 2 when there is genuine textual evidence.

## Rules:
- Score each indicator 0, 1, or 2 (integers only)
- Set confidence (0-1) based on how much evidence the text provides
- Short or minimal responses should get mostly 0s with low confidence
- Provide a brief evidence_summary (2-3 sentences) in Indonesian
- Do NOT inflate scores — most brief interactions should score 0-1 on most indicators
- Return valid JSON matching the schema exactly`;
}

// ── User prompt builder ────────────────────────────────────────────

function buildScoringUserPrompt(input: ScoringInput): string {
  const parts: string[] = [];

  parts.push(`Interaction Source: ${input.source}`);

  if (input.prompt_stage) {
    parts.push(`Heuristic Prompt Stage: ${input.prompt_stage}`);
  }

  if (input.is_follow_up) {
    parts.push('This is a FOLLOW-UP interaction to a previous AI response.');
    if (input.previous_interaction) {
      parts.push(`Previous interaction context:\n${input.previous_interaction.slice(0, 500)}`);
    }
  }

  if (input.context_summary) {
    parts.push(`Course context:\n${input.context_summary.slice(0, 300)}`);
  }

  parts.push(`Question/Prompt posed to student:\n${input.prompt_or_question.slice(0, 1000)}`);
  parts.push(`Student's response:\n${input.user_text.slice(0, 2000)}`);

  if (input.ai_response) {
    parts.push(`AI's response to student:\n${input.ai_response.slice(0, 500)}`);
  }

  if (input.reflection_fields) {
    const rf = input.reflection_fields;
    parts.push('Structured reflection fields:');
    if (rf.understood) parts.push(`  Understood: ${rf.understood.slice(0, 300)}`);
    if (rf.confused) parts.push(`  Confused about: ${rf.confused.slice(0, 300)}`);
    if (rf.strategy) parts.push(`  Strategy: ${rf.strategy.slice(0, 300)}`);
    if (rf.promptEvolution) parts.push(`  Prompt evolution: ${rf.promptEvolution.slice(0, 300)}`);
  }

  parts.push('\nScore all 12 indicators (0-2), cognitive_depth_level (1-4), confidence (0-1), and evidence_summary.');

  return parts.join('\n\n');
}

// ── JSON schema for structured output ──────────────────────────────

const SCORING_JSON_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'cognitive_scoring',
    strict: true,
    schema: {
      type: 'object',
      required: [
        'ct_decomposition', 'ct_pattern_recognition', 'ct_abstraction',
        'ct_algorithm_design', 'ct_evaluation_debugging', 'ct_generalization',
        'cth_interpretation', 'cth_analysis', 'cth_evaluation',
        'cth_inference', 'cth_explanation', 'cth_self_regulation',
        'cognitive_depth_level', 'confidence', 'evidence_summary',
      ],
      properties: {
        ct_decomposition: { type: 'number' },
        ct_pattern_recognition: { type: 'number' },
        ct_abstraction: { type: 'number' },
        ct_algorithm_design: { type: 'number' },
        ct_evaluation_debugging: { type: 'number' },
        ct_generalization: { type: 'number' },
        cth_interpretation: { type: 'number' },
        cth_analysis: { type: 'number' },
        cth_evaluation: { type: 'number' },
        cth_inference: { type: 'number' },
        cth_explanation: { type: 'number' },
        cth_self_regulation: { type: 'number' },
        cognitive_depth_level: { type: 'number' },
        confidence: { type: 'number' },
        evidence_summary: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
};

// ── Core scoring function ──────────────────────────────────────────

export async function scoreCognitive(input: ScoringInput): Promise<CognitiveScores | null> {
  // Skip scoring for very short text — not enough signal
  if (input.user_text.trim().length < 15) {
    return null;
  }

  try {
    const weights = SOURCE_INDICATOR_WEIGHTS[input.source];
    const systemPrompt = buildScoringSystemPrompt(input.source, weights);
    const userPrompt = buildScoringUserPrompt(input);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const completion = await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: SCORING_JSON_SCHEMA,
        max_completion_tokens: 500,
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw.trim());

    const clamp = (v: number) => Math.max(0, Math.min(2, Math.round(v)));
    const clampDepth = (v: number) => Math.max(1, Math.min(4, Math.round(v))) as 1 | 2 | 3 | 4;

    const scores: CognitiveScores = {
      ct_decomposition: clamp(parsed.ct_decomposition),
      ct_pattern_recognition: clamp(parsed.ct_pattern_recognition),
      ct_abstraction: clamp(parsed.ct_abstraction),
      ct_algorithm_design: clamp(parsed.ct_algorithm_design),
      ct_evaluation_debugging: clamp(parsed.ct_evaluation_debugging),
      ct_generalization: clamp(parsed.ct_generalization),
      ct_total: 0,
      cth_interpretation: clamp(parsed.cth_interpretation),
      cth_analysis: clamp(parsed.cth_analysis),
      cth_evaluation: clamp(parsed.cth_evaluation),
      cth_inference: clamp(parsed.cth_inference),
      cth_explanation: clamp(parsed.cth_explanation),
      cth_self_regulation: clamp(parsed.cth_self_regulation),
      cth_total: 0,
      cognitive_depth_level: clampDepth(parsed.cognitive_depth_level),
      confidence: Math.max(0, Math.min(1, parsed.confidence)),
      evidence_summary: String(parsed.evidence_summary || '').slice(0, 500),
    };

    scores.ct_total =
      scores.ct_decomposition + scores.ct_pattern_recognition + scores.ct_abstraction +
      scores.ct_algorithm_design + scores.ct_evaluation_debugging + scores.ct_generalization;

    scores.cth_total =
      scores.cth_interpretation + scores.cth_analysis + scores.cth_evaluation +
      scores.cth_inference + scores.cth_explanation + scores.cth_self_regulation;

    return scores;
  } catch (error) {
    console.error(`[CognitiveScoring] Failed to score ${input.source}:`, error);
    return null;
  }
}

// ── Persistence ────────────────────────────────────────────────────

export async function saveAutoScore(
  input: ScoringInput,
  scores: CognitiveScores,
): Promise<void> {
  try {
    await adminDb.from('auto_cognitive_scores').insert({
      source: input.source,
      source_id: input.source_id,
      user_id: input.user_id,
      course_id: input.course_id,
      ct_decomposition: scores.ct_decomposition,
      ct_pattern_recognition: scores.ct_pattern_recognition,
      ct_abstraction: scores.ct_abstraction,
      ct_algorithm_design: scores.ct_algorithm_design,
      ct_evaluation_debugging: scores.ct_evaluation_debugging,
      ct_generalization: scores.ct_generalization,
      cth_interpretation: scores.cth_interpretation,
      cth_analysis: scores.cth_analysis,
      cth_evaluation: scores.cth_evaluation,
      cth_inference: scores.cth_inference,
      cth_explanation: scores.cth_explanation,
      cth_self_regulation: scores.cth_self_regulation,
      cognitive_depth_level: scores.cognitive_depth_level,
      confidence: scores.confidence,
      evidence_summary: scores.evidence_summary,
      assessment_method: 'llm_auto',
      prompt_stage: input.prompt_stage || null,
      is_follow_up: input.is_follow_up || false,
    });
  } catch (error) {
    console.error(`[CognitiveScoring] Failed to save score for ${input.source}/${input.source_id}:`, error);
  }
}

// ── Combined convenience function ──────────────────────────────────

export async function scoreAndSave(input: ScoringInput): Promise<CognitiveScores | null> {
  const scores = await scoreCognitive(input);
  if (scores) {
    await saveAutoScore(input, scores);
  }
  return scores;
}
