import { openai, defaultOpenAIModel } from '@/lib/openai';
import { adminDb } from '@/lib/database';
import {
  ThinkingSkillMeta,
  buildThinkingSkillGuidanceLines,
} from '@/lib/discussion/thinkingSkills';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';

interface TemplateStep {
  key: string;
  prompt: string;
  expected_type?: string;
  options?: string[];
  answer?: string | number;
  feedback?: {
    correct?: string;
    incorrect?: string;
  };
  goal_refs?: string[];
}

interface TemplatePhase {
  id: string;
  description?: string;
  steps: TemplateStep[];
}

interface TemplateGoal {
  id: string;
  description: string;
  thinking_skill: ThinkingSkillMeta;
  rubric?: {
    success_summary?: string;
    checklist?: string[];
    failure_signals?: string[];
  };
}

interface DiscussionTemplatePayload {
  templateId: string;
  phases: TemplatePhase[];
  learning_goals: TemplateGoal[];
  closing_message?: string;
}

interface ModuleSubtopicContext {
  title: string;
  summary: string;
  objectives: string[];
  keyTakeaways: string[];
  misconceptions: string[];
}

interface ModuleDiscussionTemplateParams {
  courseId: string;
  subtopicId: string;
  moduleTitle: string;
  summary: string;
  learningObjectives: string[];
  keyTakeaways: string[];
  misconceptions?: string[];
  subtopics: ModuleSubtopicContext[];
  generationMode?: DiscussionTemplateGenerationMode;
  generationTrigger?: string;
}

type DiscussionTemplateGenerationMode = 'ai_initial' | 'ai_regenerated';
type TemplateGenerationFailureCode =
  | 'token_budget_exhausted'
  | 'empty_response'
  | 'invalid_json'
  | 'invalid_schema'
  | 'openai_request_failed';

const TEMPLATE_PROMPT_VERSION = 'discussion-template-v2';
const TEMPLATE_GENERATION_ATTEMPTS = 1;
const TEMPLATE_OPENAI_TIMEOUT_MS = 52_000;
const SUBTOPIC_MAX_COMPLETION_TOKENS = 7000;
const MODULE_MAX_COMPLETION_TOKENS = 9000;
const TEMPLATE_REASONING_EFFORT = 'low' as const;
const discussionTemplateModel =
  process.env.OPENAI_DISCUSSION_TEMPLATE_MODEL || defaultOpenAIModel;

export class DiscussionTemplateGenerationError extends Error {
  public readonly code: TemplateGenerationFailureCode;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: TemplateGenerationFailureCode,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DiscussionTemplateGenerationError';
    this.code = code;
    this.details = details;
  }
}

function isTemplateStep(step: unknown): step is TemplateStep {
  if (!step || typeof step !== 'object') return false;
  const s = step as Record<string, unknown>;
  return (
    typeof s.key === 'string' &&
    typeof s.prompt === 'string' &&
    (s.expected_type === undefined ||
      ['open', 'mcq', 'scale', 'reflection'].includes(String(s.expected_type))) &&
    (s.options === undefined || (Array.isArray(s.options) && s.options.every((opt: unknown) => typeof opt === 'string'))) &&
    (s.goal_refs === undefined || (Array.isArray(s.goal_refs) && s.goal_refs.every((ref: unknown) => typeof ref === 'string')))
  );
}

function isTemplatePhase(phase: unknown): phase is TemplatePhase {
  if (!phase || typeof phase !== 'object') return false;
  const p = phase as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    (p.description === undefined || typeof p.description === 'string') &&
    Array.isArray(p.steps) &&
    (p.steps as unknown[]).length > 0 &&
    (p.steps as unknown[]).every(isTemplateStep)
  );
}

function isThinkingSkillMeta(meta: unknown): meta is ThinkingSkillMeta {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  return (
    (m.domain === 'critical' || m.domain === 'computational') &&
    typeof m.indicator === 'string' &&
    (m.indicator as string).trim().length > 0 &&
    (m.indicator_description === undefined || typeof m.indicator_description === 'string')
  );
}

function isTemplateGoal(goal: unknown): goal is TemplateGoal {
  if (!goal || typeof goal !== 'object') return false;
  const g = goal as Record<string, unknown>;
  if (typeof g.id !== 'string' || typeof g.description !== 'string') return false;
  if (!isThinkingSkillMeta(g.thinking_skill)) return false;
  if (g.rubric !== undefined) {
    if (!g.rubric || typeof g.rubric !== 'object') return false;
    const r = g.rubric as Record<string, unknown>;
    if (r.success_summary !== undefined && typeof r.success_summary !== 'string') return false;
    if (r.checklist !== undefined) {
      if (!Array.isArray(r.checklist) || !r.checklist.every((item: unknown) => typeof item === 'string')) return false;
    }
    if (r.failure_signals !== undefined) {
      if (!Array.isArray(r.failure_signals) || !r.failure_signals.every((item: unknown) => typeof item === 'string')) return false;
    }
  }
  return true;
}

function isValidTemplate(data: unknown): data is DiscussionTemplatePayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.templateId === 'string' &&
    Array.isArray(d.phases) &&
    (d.phases as unknown[]).length > 0 &&
    (d.phases as unknown[]).every(isTemplatePhase) &&
    Array.isArray(d.learning_goals) &&
    (d.learning_goals as unknown[]).length > 0 &&
    (d.learning_goals as unknown[]).every(isTemplateGoal) &&
    (d.closing_message === undefined || typeof d.closing_message === 'string')
  );
}

const responseFormat = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'discussion_template',
    schema: {
      type: 'object',
      required: ['templateId', 'phases', 'learning_goals'],
      properties: {
        templateId: { type: 'string' },
        phases: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'steps'],
            properties: {
              id: { type: 'string' },
              description: { type: 'string' },
              steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  required: ['key', 'prompt'],
                  properties: {
                    key: { type: 'string' },
                    prompt: { type: 'string' },
                    expected_type: {
                      type: 'string',
                      enum: ['open', 'mcq', 'scale', 'reflection'],
                    },
                    options: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    answer: {
                      anyOf: [{ type: 'string' }, { type: 'number' }],
                    },
                    feedback: {
                      type: 'object',
                      properties: {
                        correct: { type: 'string' },
                        incorrect: { type: 'string' },
                      },
                    },
                    goal_refs: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        learning_goals: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            required: ['id', 'description', 'thinking_skill'],
            properties: {
              id: { type: 'string' },
              description: { type: 'string' },
              thinking_skill: {
                type: 'object',
                required: ['domain', 'indicator'],
                properties: {
                  domain: {
                    type: 'string',
                    enum: ['critical', 'computational'],
                  },
                  indicator: { type: 'string' },
                  indicator_description: { type: 'string' },
                },
              },
              rubric: {
                type: 'object',
                properties: {
                  success_summary: { type: 'string' },
                  checklist: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  failure_signals: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        closing_message: { type: 'string' },
      },
    },
  },
};

export interface DiscussionTemplateParams {
  courseId: string;
  subtopicId: string;
  moduleTitle: string;
  subtopicTitle: string;
  learningObjectives: string[];
  summary: string;
  keyTakeaways: string[];
  misconceptions?: string[];
  generationMode?: DiscussionTemplateGenerationMode;
  generationTrigger?: string;
}

export interface DiscussionTemplateResult {
  templateId: string;
  templateVersion: string;
}

export async function generateDiscussionTemplate(
  params: DiscussionTemplateParams
): Promise<DiscussionTemplateResult | null> {
  try {
    const prompt = buildPrompt(params);
    const generated = await requestTemplateFromOpenAI({
      scope: 'subtopic',
      maxCompletionTokens: SUBTOPIC_MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    if (!generated) {
      return null;
    }

    const normalized = normalizeTemplate(generated.template);
    const version = new Date().toISOString();
    const generationMode = params.generationMode ?? 'ai_initial';

    const { data, error } = await adminDb
      .from('discussion_templates')
      .insert({
        course_id: params.courseId,
        subtopic_id: params.subtopicId,
        version,
        source: {
          scope: 'subtopic',
          moduleTitle: params.moduleTitle,
          subtopicTitle: params.subtopicTitle,
          learningObjectives: params.learningObjectives,
          summary: params.summary,
          keyTakeaways: params.keyTakeaways,
          misconceptions: params.misconceptions ?? [],
          generation: buildGenerationMetadata({
            mode: generationMode,
            scope: 'subtopic',
            trigger: params.generationTrigger ?? 'subtopic_generation',
            generatedAt: version,
            attempts: generated.attempts,
          }),
        },
        template: normalized,
        generated_by: 'auto',
      });

    if (error) {
      console.error('[DiscussionTemplate] Failed to save template', error);
      return null;
    }

    return {
      templateId: (data as { id: string }).id,
      templateVersion: version,
    };
  } catch (error) {
    if (error instanceof DiscussionTemplateGenerationError) {
      console.error('[DiscussionTemplate] Template generation failed', {
        scope: 'subtopic',
        code: error.code,
        details: error.details,
      });
      throw error;
    }
    console.error('[DiscussionTemplate] Error generating template', error);
    return null;
  }
}

export async function generateModuleDiscussionTemplate(
  params: ModuleDiscussionTemplateParams
): Promise<DiscussionTemplateResult | null> {
  try {
    if (!params.subtopics.length) {
      console.warn('[DiscussionTemplate] Skipping module template generation: no subtopics provided');
      return null;
    }

    const generated = await requestTemplateFromOpenAI({
      scope: 'module',
      maxCompletionTokens: MODULE_MAX_COMPLETION_TOKENS,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: buildModulePrompt(params),
        },
      ],
    });

    if (!generated) {
      return null;
    }

    const normalized = normalizeTemplate(generated.template);
    const version = new Date().toISOString();
    const generationMode = params.generationMode ?? 'ai_initial';

    const { data, error } = await adminDb
      .from('discussion_templates')
      .insert({
        course_id: params.courseId,
        subtopic_id: params.subtopicId,
        version,
        source: {
          scope: 'module',
          moduleTitle: params.moduleTitle,
          subtopicTitle: params.moduleTitle,
          summary: params.summary,
          learningObjectives: params.learningObjectives,
          keyTakeaways: params.keyTakeaways,
          misconceptions: params.misconceptions ?? [],
          subtopics: params.subtopics,
          generation: buildGenerationMetadata({
            mode: generationMode,
            scope: 'module',
            trigger: params.generationTrigger ?? 'module_discussion_generation',
            generatedAt: version,
            attempts: generated.attempts,
          }),
        },
        template: normalized,
        generated_by: 'auto-module',
      });

    if (error) {
      console.error('[DiscussionTemplate] Failed to save module template', error);
      return null;
    }

    return {
      templateId: (data as { id: string }).id,
      templateVersion: version,
    };
  } catch (error) {
    if (error instanceof DiscussionTemplateGenerationError) {
      console.error('[DiscussionTemplate] Template generation failed', {
        scope: 'module',
        code: error.code,
        details: error.details,
      });
      throw error;
    }
    console.error('[DiscussionTemplate] Error generating module template', error);
    return null;
  }
}

async function requestTemplateFromOpenAI(params: {
  scope: 'subtopic' | 'module';
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxCompletionTokens: number;
}): Promise<{ template: DiscussionTemplatePayload; attempts: number } | null> {
  let lastFailure: DiscussionTemplateGenerationError | null = null;

  for (let attempt = 1; attempt <= TEMPLATE_GENERATION_ATTEMPTS; attempt += 1) {
    try {
      const requestBody: ChatCompletionCreateParamsNonStreaming = {
        model: discussionTemplateModel,
        messages: params.messages,
        response_format: responseFormat,
        max_completion_tokens: params.maxCompletionTokens,
      };

      if (supportsReasoningEffort(discussionTemplateModel)) {
        requestBody.reasoning_effort = TEMPLATE_REASONING_EFFORT;
      }

      const completion = await openai.chat.completions.create(requestBody, {
        maxRetries: 0,
        timeout: TEMPLATE_OPENAI_TIMEOUT_MS,
      });

      const choice = completion.choices?.[0];
      const message = choice?.message as
        | { content?: string | null; refusal?: string | null }
        | undefined;
      const raw = message?.content;
      const finishReason = choice?.finish_reason ?? null;
      const diagnostics = buildCompletionDiagnostics({
        scope: params.scope,
        attempt,
        finishReason,
        refusal: message?.refusal ?? null,
        usage: completion.usage ?? null,
        hasContent: Boolean(raw && raw.trim()),
        maxCompletionTokens: params.maxCompletionTokens,
      });

      logCompletionDiagnostics(diagnostics);

      if (!raw || !raw.trim()) {
        lastFailure = new DiscussionTemplateGenerationError(
          finishReason === 'length'
            ? 'OpenAI exhausted the completion token budget before returning visible template JSON.'
            : 'OpenAI returned an empty discussion template response.',
          finishReason === 'length' ? 'token_budget_exhausted' : 'empty_response',
          diagnostics,
        );
        console.warn('[DiscussionTemplate] Empty response from OpenAI', {
          scope: params.scope,
          attempt,
          finishReason,
          model: discussionTemplateModel,
        });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        lastFailure = new DiscussionTemplateGenerationError(
          'OpenAI returned discussion template content that was not valid JSON.',
          'invalid_json',
          {
            ...diagnostics,
            parseError: safeErrorMessage(parseError),
          },
        );
        console.error('[DiscussionTemplate] Failed to parse template JSON', {
          scope: params.scope,
          attempt,
          error: parseError,
        });
        continue;
      }

      if (!isValidTemplate(parsed)) {
        lastFailure = new DiscussionTemplateGenerationError(
          'OpenAI returned discussion template JSON that did not match the required structure.',
          'invalid_schema',
          diagnostics,
        );
        console.error('[DiscussionTemplate] Validation failed: invalid template structure', {
          scope: params.scope,
          attempt,
        });
        continue;
      }

      return { template: parsed, attempts: attempt };
    } catch (error) {
      if (error instanceof DiscussionTemplateGenerationError) {
        lastFailure = error;
        continue;
      }
      lastFailure = new DiscussionTemplateGenerationError(
        'OpenAI request failed while preparing discussion template.',
        'openai_request_failed',
        {
          scope: params.scope,
          attempt,
          model: discussionTemplateModel,
          error: safeErrorMessage(error),
        },
      );
      console.error('[DiscussionTemplate] OpenAI template attempt failed', {
        scope: params.scope,
        attempt,
        error,
      });
    }
  }

  console.error('[DiscussionTemplate] Template generation exhausted attempts', {
    scope: params.scope,
    attempts: TEMPLATE_GENERATION_ATTEMPTS,
    model: discussionTemplateModel,
    code: lastFailure?.code,
    details: lastFailure?.details,
  });
  throw (
    lastFailure ??
    new DiscussionTemplateGenerationError(
      'OpenAI did not return a usable discussion template.',
      'empty_response',
      {
        scope: params.scope,
        attempts: TEMPLATE_GENERATION_ATTEMPTS,
        model: discussionTemplateModel,
      },
    )
  );
}

function buildCompletionDiagnostics(params: {
  scope: 'subtopic' | 'module';
  attempt: number;
  finishReason: string | null;
  refusal: string | null;
  usage: unknown;
  hasContent: boolean;
  maxCompletionTokens: number;
}) {
  const usage = params.usage as
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        completion_tokens_details?: {
          reasoning_tokens?: number;
        };
      }
    | null;

  return {
    scope: params.scope,
    attempt: params.attempt,
    finishReason: params.finishReason,
    hasContent: params.hasContent,
    refusal: params.refusal ? '[present]' : null,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
    reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
    totalTokens: usage?.total_tokens,
    model: discussionTemplateModel,
    reasoningEffort: supportsReasoningEffort(discussionTemplateModel)
      ? TEMPLATE_REASONING_EFFORT
      : null,
    maxCompletionTokens: params.maxCompletionTokens,
  };
}

function logCompletionDiagnostics(params: Record<string, unknown>) {
  console.info('[DiscussionTemplate] OpenAI completion diagnostics', params);
}

function buildGenerationMetadata(params: {
  mode: DiscussionTemplateGenerationMode;
  scope: 'subtopic' | 'module';
  trigger: string;
  generatedAt: string;
  attempts: number;
}) {
  return {
    mode: params.mode,
    scope: params.scope,
    trigger: params.trigger,
    provider: 'openai',
    model: discussionTemplateModel,
    promptVersion: TEMPLATE_PROMPT_VERSION,
    attempts: params.attempts,
    generatedAt: params.generatedAt,
    status: 'ready',
  };
}

function supportsReasoningEffort(model: string) {
  const normalized = model.toLowerCase();
  return (
    normalized.startsWith('gpt-5') ||
    normalized.startsWith('o1') ||
    normalized.startsWith('o3') ||
    normalized.startsWith('o4')
  );
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function buildSystemPrompt() {
  return [
    'You are an instructional designer creating Socratic discussion scripts.',
    'Your output must be valid JSON and follow the provided schema.',
    'Language must match the learner materials; when in doubt default to Bahasa Indonesia with clear, natural academic tone.',
    'Phases must progress from diagnosis to synthesis and ensure coverage of the learning goals.',
    'Each step should encourage reflection, justification, or application rather than giving direct answers.',
    'Provide measurable rubrics for each learning goal to help facilitators evaluate responses.',
    'Keep the template concise: prefer one strong prompt per phase, short options, and rubric bullets that are specific but not long.',
    'Add a closing message that the coach can deliver when mastery is achieved.',
  ].join('\n');
}

function buildPrompt({
  moduleTitle,
  subtopicTitle,
  learningObjectives,
  summary,
  keyTakeaways,
  misconceptions = [],
}: DiscussionTemplateParams) {
  const thinkingSkillLines = buildThinkingSkillGuidanceLines();
  const safeObjectives = limitStringArray(learningObjectives, 5, 260);
  const safeTakeaways = limitStringArray(keyTakeaways, 5, 260);
  const safeMisconceptions = limitStringArray(misconceptions, 4, 220);

  return [
    `Module Title: ${moduleTitle}`,
    `Subtopic Title: ${subtopicTitle}`,
    '',
    'Learning Objectives:',
    ...safeObjectives.map((item) => `- ${item}`),
    '',
    'Subtopic Summary:',
    truncateText(summary || '-', 1600),
    '',
    'Key Takeaways:',
    ...safeTakeaways.map((item) => `- ${item}`),
    safeTakeaways.length ? '' : '-',
    '',
    'Common Misconceptions or pitfalls:',
    ...(safeMisconceptions.length ? safeMisconceptions.map((item) => `- ${item}`) : ['- None provided']),
    '',
    'Panduan indikator kemampuan berpikir:',
    ...thinkingSkillLines,
    '',
    'Requirements:',
    '- Create exactly four phases: diagnosis, exploration, practice, synthesis.',
    '- Each phase should have one high-quality step with a unique `key`.',
    '- Include at least one step with `expected_type` set to "mcq" complete with `options`, `answer`, and feedback.',
    '- Ensure every step lists relevant `goal_refs` referencing the learning goals you define.',
    '- Learning goals should be exactly 4 statements derived from objectives and takeaways.',
    '- For each learning goal, provide a concise `rubric` object containing `success_summary`, a `checklist` of concrete indicators (2-3 items), and optional `failure_signals` describing common misconceptions.',
    '- Every learning goal MUST include a `thinking_skill` object describing the related indicator (`domain`, `indicator`, and `indicator_description`).',
    '- The set of learning goals must cover at least one Critical Thinking indicator and one Computational Thinking indicator (preferably balanced).',
    '- Reference both thinking skill categories across the phases so that learners practice CT and CPT in tandem.',
    '- Add a `closing_message` string that congratulates the learner and reinforces next steps when all goals are satisfied.',
    '- Encourage deeper thinking; avoid revealing final answers directly.',
    '- Tulis seluruh konten (pertanyaan, opsi, umpan balik, rubric, closing message) dalam Bahasa Indonesia yang jelas dan sesuai konteks modul.',
    '',
    'Return only JSON that matches the schema.',
  ].join('\n');
}

function buildModulePrompt({
  moduleTitle,
  summary,
  learningObjectives,
  keyTakeaways,
  misconceptions = [],
  subtopics,
}: ModuleDiscussionTemplateParams) {
  const thinkingSkillLines = buildThinkingSkillGuidanceLines();
  const safeObjectives = limitStringArray(learningObjectives, 8, 240);
  const safeTakeaways = limitStringArray(keyTakeaways, 10, 240);
  const safeMisconceptions = limitStringArray(misconceptions, 6, 220);

  const subtopicSections = subtopics.map((item, index) => {
    const header = `${index + 1}. ${item.title}`;
    const summaryLine = item.summary ? `Ringkasan: ${truncateText(item.summary, 900)}` : null;
    const objectiveLines =
      item.objectives.length > 0
        ? ['Tujuan utama:', ...limitStringArray(item.objectives, 3, 220).map((goal) => `- ${goal}`)]
        : null;
    const takeawayLines =
      item.keyTakeaways.length > 0
        ? ['Takeaways penting:', ...limitStringArray(item.keyTakeaways, 3, 220).map((point) => `- ${point}`)]
        : null;
    const misconceptionLines =
      item.misconceptions.length > 0
        ? ['Miskonsepsi umum:', ...limitStringArray(item.misconceptions, 2, 180).map((miss) => `- ${miss}`)]
        : null;

    return [header, summaryLine, objectiveLines, takeawayLines, misconceptionLines]
      .flat()
      .filter(Boolean)
      .join('\n');
  });

  return [
    `Modul: ${moduleTitle}`,
    '',
    'Ringkasan modul:',
    truncateText(summary || '-', 2600),
    '',
    'Tujuan pembelajaran gabungan:',
    ...(safeObjectives.length ? safeObjectives.map((goal) => `- ${goal}`) : ['-']),
    '',
    'Key takeaways gabungan:',
    ...(safeTakeaways.length ? safeTakeaways.map((item) => `- ${item}`) : ['-']),
    '',
    'Miskonsepsi lintas subtopik:',
    ...(safeMisconceptions.length ? safeMisconceptions.map((item) => `- ${item}`) : ['- None provided']),
    '',
    'Detail setiap subtopik dalam modul:',
    ...subtopicSections,
    '',
    'Panduan indikator kemampuan berpikir:',
    ...thinkingSkillLines,
    '',
    'Instruksi:',
    '- Rancang diskusi Socratic yang meninjau seluruh modul, pastikan setiap subtopik disentuh.',
    '- Gunakan tepat empat fase: diagnosis, eksplorasi, latihan, dan sintesis untuk mengaitkan konsep lintas subtopik.',
    '- Setiap fase sebaiknya berisi satu prompt utama yang tajam dan kontekstual.',
    '- Soroti hubungan antar subtopik dan bagaimana konsep awal mendukung konsep lanjutan.',
    '- Dalam setiap langkah, kaitkan pertanyaan dengan learning goals relevan dan minta peserta menghubungkan antar topik.',
    '- Pastikan ada minimal satu pertanyaan MCQ dengan opsi, jawaban, dan umpan balik.',
    '- Buat tepat 4 learning goal dan pastikan rubric goal mengevaluasi pemahaman menyeluruh terhadap seluruh modul, bukan sekadar subtopik tunggal.',
    '- Jaga output tetap ringkas: pertanyaan, opsi, feedback, dan rubric harus padat tetapi tetap spesifik.',
    '- Setiap learning goal wajib memiliki `thinking_skill` sesuai daftar indikator (lengkapi domain, indicator, indicator_description).',
    '- Susun goal sehingga keduanya mencakup indikator Critical Thinking dan Computational Thinking, dan pastikan langkah diskusi memancing kedua jenis kemampuan tersebut.',
    '- Tambahkan closing message yang mengajak peserta menerapkan pengetahuan modul secara terpadu.',
    '- Gunakan Bahasa Indonesia yang formal namun mudah dipahami untuk seluruh elemen output.',
    '',
    'Return only JSON that matches the schema.',
  ].join('\n');
}

function normalizeTemplate(template: DiscussionTemplatePayload) {
  const goalSet = new Set(template.learning_goals.map((goal) => goal.id));

  const phases = template.phases.map((phase) => {
    const steps = phase.steps.map((step, index) => {
      const key = step.key?.trim() || `${phase.id}.step${index + 1}`;
      const goalRefs = (step.goal_refs || []).filter((goal) => goalSet.has(goal));

      return {
        ...step,
        expected_type: step.expected_type || 'open',
        key,
        goal_refs: goalRefs,
      };
    });

    return {
      ...phase,
      steps,
    };
  });

  return {
    templateId: template.templateId,
    phases,
    learning_goals: template.learning_goals,
    closing_message: template.closing_message,
  };
}

function limitStringArray(values: string[], maxItems: number, maxLength: number) {
  return values
    .filter((value) => typeof value === 'string' && value.trim().length > 0)
    .slice(0, maxItems)
    .map((value) => truncateText(value.trim(), maxLength));
}

function truncateText(value: string, maxLength: number) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}
