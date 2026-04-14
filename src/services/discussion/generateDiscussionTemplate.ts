import { openai, defaultOpenAIModel } from '@/lib/openai';
import { adminDb } from '@/lib/database';
import {
  ThinkingSkillMeta,
  buildThinkingSkillGuidanceLines,
} from '@/lib/discussion/thinkingSkills';

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
            required: ['id', 'description'],
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

    const completion = await openai.chat.completions.create({
      model: defaultOpenAIModel,
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
      response_format: responseFormat,
      max_completion_tokens: 1400,
    });

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn('[DiscussionTemplate] Empty response from OpenAI');
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isValidTemplate(parsed)) {
      console.error('[DiscussionTemplate] Validation failed: invalid structure');
      return null;
    }

    const normalized = normalizeTemplate(parsed);
    const version = new Date().toISOString();

    const { data, error } = await adminDb
      .from('discussion_templates')
      .insert({
        course_id: params.courseId,
        subtopic_id: params.subtopicId,
        version,
        source: {
          moduleTitle: params.moduleTitle,
          subtopicTitle: params.subtopicTitle,
          learningObjectives: params.learningObjectives,
          summary: params.summary,
          keyTakeaways: params.keyTakeaways,
          misconceptions: params.misconceptions ?? [],
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

    const completion = await openai.chat.completions.create({
      model: defaultOpenAIModel,
      response_format: responseFormat,
      max_completion_tokens: 1600,
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

    const raw = completion.choices?.[0]?.message?.content;
    if (!raw) {
      console.warn('[DiscussionTemplate] Empty response from OpenAI (module scope)');
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!isValidTemplate(parsed)) {
      console.error('[DiscussionTemplate] Validation failed: invalid module template structure');
      return null;
    }

    const normalized = normalizeTemplate(parsed);
    const version = new Date().toISOString();

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
    console.error('[DiscussionTemplate] Error generating module template', error);
    return null;
  }
}

function buildSystemPrompt() {
  return [
    'You are an instructional designer creating Socratic discussion scripts.',
    'Your output must be valid JSON and follow the provided schema.',
    'Language must match the learner materials; when in doubt default to Bahasa Indonesia with clear, natural academic tone.',
    'Phases must progress from diagnosis to synthesis and ensure coverage of the learning goals.',
    'Each step should encourage reflection, justification, or application rather than giving direct answers.',
    'Provide measurable rubrics for each learning goal to help facilitators evaluate responses.',
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

  return [
    `Module Title: ${moduleTitle}`,
    `Subtopic Title: ${subtopicTitle}`,
    '',
    'Learning Objectives:',
    ...learningObjectives.map((item) => `- ${item}`),
    '',
    'Subtopic Summary:',
    summary || '-',
    '',
    'Key Takeaways:',
    ...keyTakeaways.map((item) => `- ${item}`),
    keyTakeaways.length ? '' : '-',
    '',
    'Common Misconceptions or pitfalls:',
    ...(misconceptions.length ? misconceptions.map((item) => `- ${item}`) : ['- None provided']),
    '',
    'Panduan indikator kemampuan berpikir:',
    ...thinkingSkillLines,
    '',
    'Requirements:',
    '- Create four phases: diagnosis, exploration, practice, synthesis.',
    '- Each phase must have at least one step with a unique `key`.',
    '- Include at least one step with `expected_type` set to "mcq" complete with `options`, `answer`, and feedback.',
    '- Ensure every step lists relevant `goal_refs` referencing the learning goals you define.',
    '- Learning goals should be 3-5 statements derived from objectives and takeaways.',
    '- For each learning goal, provide a `rubric` object containing `success_summary`, a `checklist` of concrete indicators (2-4 items), and optional `failure_signals` describing common misconceptions.',
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

  const subtopicSections = subtopics.map((item, index) => {
    const header = `${index + 1}. ${item.title}`;
    const summaryLine = item.summary ? `Ringkasan: ${item.summary}` : null;
    const objectiveLines =
      item.objectives.length > 0
        ? ['Tujuan utama:', ...item.objectives.map((goal) => `- ${goal}`)]
        : null;
    const takeawayLines =
      item.keyTakeaways.length > 0
        ? ['Takeaways penting:', ...item.keyTakeaways.map((point) => `- ${point}`)]
        : null;
    const misconceptionLines =
      item.misconceptions.length > 0
        ? ['Miskonsepsi umum:', ...item.misconceptions.map((miss) => `- ${miss}`)]
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
    summary || '-',
    '',
    'Tujuan pembelajaran gabungan:',
    ...(learningObjectives.length ? learningObjectives.map((goal) => `- ${goal}`) : ['-']),
    '',
    'Key takeaways gabungan:',
    ...(keyTakeaways.length ? keyTakeaways.map((item) => `- ${item}`) : ['-']),
    '',
    'Miskonsepsi lintas subtopik:',
    ...(misconceptions.length ? misconceptions.map((item) => `- ${item}`) : ['- None provided']),
    '',
    'Detail setiap subtopik dalam modul:',
    ...subtopicSections,
    '',
    'Panduan indikator kemampuan berpikir:',
    ...thinkingSkillLines,
    '',
    'Instruksi:',
    '- Rancang diskusi Socratic yang meninjau seluruh modul, pastikan setiap subtopik disentuh.',
    '- Gunakan fase diagnosis, eksplorasi, latihan, dan sintesis untuk mengaitkan konsep lintas subtopik.',
    '- Soroti hubungan antar subtopik dan bagaimana konsep awal mendukung konsep lanjutan.',
    '- Dalam setiap langkah, kaitkan pertanyaan dengan learning goals relevan dan minta peserta menghubungkan antar topik.',
    '- Pastikan ada minimal satu pertanyaan MCQ dengan opsi, jawaban, dan umpan balik.',
    '- Pastikan rubric goal mengevaluasi pemahaman menyeluruh terhadap seluruh modul, bukan sekadar subtopik tunggal.',
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
