import { openai, defaultOpenAIModel } from '@/lib/openai';
import { adminDb } from '@/lib/database';

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

function isTemplateStep(step: any): step is TemplateStep {
  return (
    step &&
    typeof step === 'object' &&
    typeof step.key === 'string' &&
    typeof step.prompt === 'string' &&
    (step.expected_type === undefined ||
      ['open', 'mcq', 'scale', 'reflection'].includes(String(step.expected_type))) &&
    (step.options === undefined || (Array.isArray(step.options) && step.options.every((opt) => typeof opt === 'string'))) &&
    (step.goal_refs === undefined || (Array.isArray(step.goal_refs) && step.goal_refs.every((ref) => typeof ref === 'string')))
  );
}

function isTemplatePhase(phase: any): phase is TemplatePhase {
  return (
    phase &&
    typeof phase === 'object' &&
    typeof phase.id === 'string' &&
    (phase.description === undefined || typeof phase.description === 'string') &&
    Array.isArray(phase.steps) &&
    phase.steps.length > 0 &&
    phase.steps.every(isTemplateStep)
  );
}

function isTemplateGoal(goal: any): goal is TemplateGoal {
  return (
    goal &&
    typeof goal === 'object' &&
    typeof goal.id === 'string' &&
    typeof goal.description === 'string' &&
    (goal.rubric === undefined ||
      (typeof goal.rubric === 'object' &&
        (goal.rubric.success_summary === undefined || typeof goal.rubric.success_summary === 'string') &&
        (goal.rubric.checklist === undefined ||
          (Array.isArray(goal.rubric.checklist) && goal.rubric.checklist.every((item: any) => typeof item === 'string'))) &&
        (goal.rubric.failure_signals === undefined ||
          (Array.isArray(goal.rubric.failure_signals) && goal.rubric.failure_signals.every((item: any) => typeof item === 'string')))))
  );
}

function isValidTemplate(data: any): data is DiscussionTemplatePayload {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.templateId === 'string' &&
    Array.isArray(data.phases) &&
    data.phases.length > 0 &&
    data.phases.every(isTemplatePhase) &&
    Array.isArray(data.learning_goals) &&
    data.learning_goals.length > 0 &&
    data.learning_goals.every(isTemplateGoal) &&
    (data.closing_message === undefined || typeof data.closing_message === 'string')
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
      max_tokens: 1400,
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
      })
      .select('id')
      .single();

    if (error) {
      console.error('[DiscussionTemplate] Failed to save template', error);
      return null;
    }

    return {
      templateId: data.id as string,
      templateVersion: version,
    };
  } catch (error) {
    console.error('[DiscussionTemplate] Error generating template', error);
    return null;
  }
}

function buildSystemPrompt() {
  return [
    'You are an instructional designer creating Socratic discussion scripts.',
    'Your output must be valid JSON and follow the provided schema.',
    'Language must match the learner materials; do not translate unless specified.',
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
    'Requirements:',
    '- Create four phases: diagnosis, exploration, practice, synthesis.',
    '- Each phase must have at least one step with a unique `key`.',
    '- Include at least one step with `expected_type` set to "mcq" complete with `options`, `answer`, and feedback.',
    '- Ensure every step lists relevant `goal_refs` referencing the learning goals you define.',
    '- Learning goals should be 3-5 statements derived from objectives and takeaways.',
    '- For each learning goal, provide a `rubric` object containing `success_summary`, a `checklist` of concrete indicators (2-4 items), and optional `failure_signals` describing common misconceptions.',
    '- Add a `closing_message` string that congratulates the learner and reinforces next steps when all goals are satisfied.',
    '- Encourage deeper thinking; avoid revealing final answers directly.',
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
