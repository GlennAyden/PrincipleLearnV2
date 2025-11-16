import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { openai, defaultOpenAIModel } from '@/lib/openai';
import { withApiLogging } from '@/lib/api-logger';
import {
  ThinkingSkillMeta,
  normalizeThinkingSkillMeta,
} from '@/lib/discussion/thinkingSkills';

interface SessionRecord {
  id: string;
  user_id: string;
  status: string;
  phase: string;
  learning_goals: any;
  template_id: string | null;
  subtopic_id: string;
  course_id: string;
}

type TemplateRecord = {
  id: string;
  template: any;
  version: string;
  source?: any;
};

interface DiscussionGoalState {
  id: string;
  description: string;
  rubric?: any;
  covered: boolean;
  thinkingSkill?: ThinkingSkillMeta | null;
}

async function postHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { sessionId, message } = body || {};

    if (!sessionId || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'sessionId and message are required' },
        { status: 400 }
      );
    }

    const session = await fetchSession(sessionId);
    if (!session || session.user_id !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Discussion already completed' },
        { status: 409 }
      );
    }

    const templateRow = await fetchTemplate(session);
    if (!templateRow) {
      return NextResponse.json(
        { error: 'Discussion template unavailable' },
        { status: 500 }
      );
    }

    const steps = flattenTemplate(templateRow.template);
    if (!steps.length) {
      return NextResponse.json(
        { error: 'Discussion template has no steps' },
        { status: 500 }
      );
    }

    await ensureProgressRecord(session.user_id, session.course_id, session.subtopic_id);

    const messages = await fetchMessages(session.id);
    const agentMessages = messages.filter(
      (msg) =>
        msg.role === 'agent' &&
        (!msg.metadata ||
          (msg.metadata.type !== 'coach_feedback' && msg.metadata.type !== 'closing'))
    );
    const currentStepIndex =
      agentMessages.length > 0 ? Math.min(agentMessages.length - 1, steps.length - 1) : 0;
    const currentStep = steps[currentStepIndex] ?? steps[0];
    const trimmedAnswer = message.trim();

    let learningGoals = mergeGoalDetails(
      normalizeGoals(session.learning_goals),
      templateRow.template?.learning_goals
    );

    const evaluation = await evaluateStepResponse({
      responseText: trimmedAnswer,
      step: currentStep?.step,
      templateGoals: templateRow.template?.learning_goals,
      templateSource: templateRow.source,
      currentGoals: learningGoals,
    });

    const studentMetadata = {
      phase: currentStep?.phaseId ?? null,
      evaluation,
    };

    await adminDb.from('discussion_messages').insert({
      session_id: session.id,
      role: 'student',
      content: trimmedAnswer,
      step_key: currentStep?.step?.key ?? null,
      metadata: studentMetadata,
    });

    if (evaluation.coachFeedback) {
      await adminDb.from('discussion_messages').insert({
        session_id: session.id,
        role: 'agent',
        content: evaluation.coachFeedback,
        step_key: currentStep?.step?.key ? `${currentStep.step.key}-feedback` : 'feedback',
        metadata: {
          type: 'coach_feedback',
          assessments: evaluation.assessments ?? [],
        },
      });
    }

    const coveredSet = new Set(evaluation.coveredGoals);
    learningGoals = learningGoals.map((goal) =>
      coveredSet.has(goal.id) ? { ...goal, covered: true } : goal
    );

    const allGoalsCovered =
      learningGoals.length > 0 && learningGoals.every((goal) => goal.covered === true);

    const nextStepCandidateIndex = currentStepIndex + 1;
    let nextStep =
      !allGoalsCovered && nextStepCandidateIndex < steps.length
        ? steps[nextStepCandidateIndex]
        : null;

    if (nextStep) {
      await adminDb.from('discussion_messages').insert({
        session_id: session.id,
        role: 'agent',
        content: nextStep.step.prompt,
        step_key: nextStep.step.key,
        metadata: {
          phase: nextStep.phaseId,
          expected_type: nextStep.step.expected_type ?? 'open',
          options: nextStep.step.options ?? [],
        },
      });

      await adminDb
        .from('discussion_sessions')
        .update({
          phase: nextStep.phaseId,
          learning_goals: learningGoals,
        })
        .eq('id', session.id);
    } else {
      const closingMessage =
        templateRow.template?.closing_message || buildDefaultClosingMessage(learningGoals);

      await adminDb
        .from('discussion_sessions')
        .update({
          phase: 'completed',
          status: 'completed',
          learning_goals: learningGoals,
        })
        .eq('id', session.id);

      await adminDb.from('discussion_messages').insert({
        session_id: session.id,
        role: 'agent',
        content: closingMessage,
        step_key: 'closing',
        metadata: {
          type: 'closing',
          goals: learningGoals,
        },
      });

      nextStep = null;
      await markProgressCompleted(session.user_id, session.course_id, session.subtopic_id);
    }

    const updatedMessages = await fetchMessages(session.id);

    return NextResponse.json({
      session: {
        id: session.id,
        status: nextStep ? 'in_progress' : 'completed',
        phase: nextStep ? nextStep.phaseId : 'completed',
        learningGoals,
      },
      messages: updatedMessages,
      nextStep: nextStep
        ? {
            key: nextStep.step.key,
            prompt: nextStep.step.prompt,
            expected_type: nextStep.step.expected_type ?? 'open',
            options: nextStep.step.options ?? [],
            phase: nextStep.phaseId,
          }
        : null,
    });
  } catch (error) {
    console.error('[DiscussionRespond] Failed to process response', error);
    return NextResponse.json(
      { error: 'Failed to process discussion response' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'discussion.respond',
});

async function fetchSession(sessionId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, user_id, status, phase, learning_goals, template_id, subtopic_id, course_id')
    .eq('id', sessionId)
    .limit(1);

  if (error) {
    console.error('[DiscussionRespond] Failed to load session', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchTemplate(session: SessionRecord): Promise<TemplateRecord | null> {
  if (session.template_id) {
    const { data, error } = await adminDb
      .from('discussion_templates')
      .select('id, template, version, source')
      .eq('id', session.template_id)
      .limit(1);

    if (!error && data?.[0]) {
      return data[0];
    }
  }

  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, template, version, source')
    .eq('subtopic_id', session.subtopic_id)
    .order('version', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[DiscussionRespond] Failed to fallback template', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchMessages(sessionId: string) {
  const { data, error } = await adminDb
    .from('discussion_messages')
    .select('id, role, content, step_key, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DiscussionRespond] Failed to load messages', error);
    return [];
  }

  return data ?? [];
}

function flattenTemplate(template: any) {
  const phases = Array.isArray(template?.phases) ? template.phases : [];
  const flattened: Array<{ phaseId: string; step: any }> = [];

  phases.forEach((phase: any) => {
    const steps = Array.isArray(phase?.steps) ? phase.steps : [];
    steps.forEach((step: any) => {
      if (step && typeof step.prompt === 'string') {
        flattened.push({
          phaseId: phase?.id || 'phase',
          step,
        });
      }
    });
  });

  return flattened;
}

function normalizeGoals(goals: any): DiscussionGoalState[] {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals.map((goal) => ({
    id: goal?.id ?? '',
    description: goal?.description ?? '',
    covered: Boolean(goal?.covered),
    rubric: goal?.rubric ?? null,
    thinkingSkill: normalizeThinkingSkillMeta(goal?.thinkingSkill ?? goal?.thinking_skill),
  }));
}

function mergeGoalDetails(
  currentGoals: DiscussionGoalState[],
  templateGoals: any
) {
  const templateArray = Array.isArray(templateGoals) ? templateGoals : [];
  if (!templateArray.length) {
    return currentGoals;
  }
  const currentMap = new Map(currentGoals.map((goal) => [goal.id, goal]));

  const merged = templateArray.map((goal: any) => {
    const existing = currentMap.get(goal?.id);
    return {
      id: goal?.id ?? existing?.id ?? '',
      description: goal?.description ?? existing?.description ?? '',
      rubric: goal?.rubric ?? existing?.rubric ?? null,
      covered: existing?.covered ?? false,
      thinkingSkill:
        normalizeThinkingSkillMeta(goal?.thinking_skill ?? goal?.thinkingSkill) ??
        existing?.thinkingSkill ??
        null,
    };
  });

  const additional = currentGoals.filter(
    (goal) => !merged.some((item) => item.id === goal.id)
  );

  return [...merged, ...additional];
}

interface StepEvaluationResult {
  coveredGoals: string[];
  assessments?: Array<{ goalId: string; satisfied: boolean; notes?: string }>;
  coachFeedback?: string;
  evaluator: 'mcq' | 'llm' | 'fallback';
}

interface EvaluateStepParams {
  responseText: string;
  step?: any;
  templateGoals?: any[];
  templateSource?: any;
  currentGoals: DiscussionGoalState[];
}

async function evaluateStepResponse({
  responseText,
  step,
  templateGoals = [],
  templateSource,
  currentGoals,
}: EvaluateStepParams): Promise<StepEvaluationResult> {
  const goalRefs: string[] = Array.isArray(step?.goal_refs) ? step.goal_refs.filter(Boolean) : [];

  if (!step || goalRefs.length === 0) {
    return {
      coveredGoals: [],
      assessments: [],
      coachFeedback: undefined,
      evaluator: 'fallback',
    };
  }

  // Handle MCQ locally
  if (
    (step.expected_type === 'mcq' || step.options) &&
    (typeof step.answer === 'string' || typeof step.answer === 'number')
  ) {
    const normalizedAnswer =
      typeof step.answer === 'number'
        ? step.options?.[step.answer] ?? `${step.answer}`
        : String(step.answer || '').trim().toLowerCase();

    const normalizedResponse = responseText.trim().toLowerCase();
    const letters = ['a', 'b', 'c', 'd', 'e', 'f'];

    let isCorrect = false;
    if (typeof step.answer === 'number' && step.options?.length) {
      const index = step.answer;
      const optionText = step.options[index]?.trim().toLowerCase();
      const letterMatch = letters[index] ?? '';
      const numericMatch = String(index + 1);

      isCorrect =
        normalizedResponse === optionText ||
        normalizedResponse === letterMatch ||
        normalizedResponse === numericMatch;
    } else {
      isCorrect = normalizedResponse === normalizedAnswer;
      if (!isCorrect && step.options?.length) {
        const matchedIndex = step.options.findIndex(
          (opt: string) => opt.trim().toLowerCase() === normalizedResponse
        );
        const answerIndex = step.options.findIndex(
          (opt: string) => opt.trim().toLowerCase() === normalizedAnswer
        );
        if (matchedIndex >= 0 && answerIndex >= 0 && matchedIndex === answerIndex) {
          isCorrect = true;
        }
      }
    }

    const coveredGoals = isCorrect ? goalRefs : [];
    const feedback = isCorrect
      ? step.feedback?.correct ??
        'Tepat! Jawabanmu menunjukkan pemahaman yang kuat terhadap konsep ini.'
      : step.feedback?.incorrect ??
        'Belum tepat. Coba telaah kembali poin utama sebelum melanjutkan.';

    return {
      coveredGoals,
      assessments: goalRefs.map((goalId) => ({
        goalId,
        satisfied: coveredGoals.includes(goalId),
        notes: coveredGoals.includes(goalId)
          ? 'Menjawab pilihan ganda dengan benar.'
          : 'Jawaban pilihan ganda belum tepat.',
      })),
      coachFeedback: feedback,
      evaluator: 'mcq',
    };
  }

  // LLM evaluation for open/reflection responses
  try {
    const goalDetails = goalRefs.map((goalId) => {
      const templateGoal = templateGoals.find((goal) => goal?.id === goalId);
      const currentGoal = currentGoals.find((goal) => goal.id === goalId);
      return {
        id: goalId,
        description: templateGoal?.description ?? currentGoal?.description ?? goalId,
        rubric: templateGoal?.rubric ?? currentGoal?.rubric ?? null,
      };
    });

    const contextParts: string[] = [];
    if (templateSource?.summary) {
      contextParts.push(`Ringkasan Subtopik: ${templateSource.summary}`);
    }
    if (Array.isArray(templateSource?.keyTakeaways) && templateSource.keyTakeaways.length > 0) {
      contextParts.push(
        'Poin Penting:\n' +
          templateSource.keyTakeaways.map((item: string) => `- ${item}`).join('\n')
      );
    }
    if (Array.isArray(templateSource?.learningObjectives) && templateSource.learningObjectives.length > 0) {
      contextParts.push(
        'Learning Objectives:\n' +
          templateSource.learningObjectives.map((item: string) => `- ${item}`).join('\n')
      );
    }

    const contextBlock = contextParts.join('\n\n');
    const goalsBlock = goalDetails
      .map((goal) => {
        const checklist = Array.isArray(goal.rubric?.checklist)
          ? goal.rubric.checklist.map((item: string) => `    • ${item}`).join('\n')
          : '';
        const failureSignals = Array.isArray(goal.rubric?.failure_signals)
          ? goal.rubric.failure_signals.map((item: string) => `    • ${item}`).join('\n')
          : '';
        return [
          `- Goal ID: ${goal.id}`,
          `  Deskripsi: ${goal.description}`,
          `  Ringkasan Keberhasilan: ${goal.rubric?.success_summary ?? 'Tidak tersedia'}`,
          checklist ? `  Checklist:\n${checklist}` : '',
          failureSignals ? `  Sinyal Kesalahan:\n${failureSignals}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n\n');

    const evaluationSchema = {
      type: 'json_schema',
      json_schema: {
        name: 'goal_assessment',
        schema: {
          type: 'object',
          required: ['goalAssessments'],
          properties: {
            goalAssessments: {
              type: 'array',
              items: {
                type: 'object',
                required: ['goalId', 'satisfied'],
                properties: {
                  goalId: { type: 'string' },
                  satisfied: { type: 'boolean' },
                  notes: { type: 'string' },
                },
              },
            },
            coachFeedback: { type: 'string' },
          },
        },
      },
    } as const;

    const completion = await openai.chat.completions.create({
      model: defaultOpenAIModel,
      response_format: evaluationSchema,
      max_tokens: 700,
      messages: [
        {
          role: 'system',
          content:
            'You are a learning facilitator evaluating a learner’s response. Use the rubric to judge whether each goal is satisfied. Respond only with JSON that matches the required schema.',
        },
        {
          role: 'user',
          content: [
            contextBlock ? contextBlock : 'Ringkasan tidak tersedia.',
            '',
            'Goals yang dinilai:',
            goalsBlock,
            '',
            `Pertanyaan/Penugasan: ${step?.prompt ?? '-'}`,
            `Jawaban peserta: ${responseText}`,
            '',
            'Nilailah setiap goal dengan menandai satisfied true/false dan cantumkan catatan singkat. Buat juga coachFeedback ringkas (2-3 kalimat) dalam bahasa yang sama dengan materi.',
          ].join('\n'),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw.trim() || '{}');
    const goalAssessments = Array.isArray(parsed.goalAssessments)
      ? parsed.goalAssessments
          .filter((assessment: any) => goalRefs.includes(assessment?.goalId))
          .map((assessment: any) => ({
            goalId: assessment.goalId,
            satisfied: Boolean(assessment.satisfied),
            notes: assessment.notes,
          }))
      : [];

    const coveredGoals = goalAssessments
      .filter((assessment) => assessment.satisfied)
      .map((assessment) => assessment.goalId);

    return {
      coveredGoals,
      assessments: goalAssessments,
      coachFeedback: parsed.coachFeedback,
      evaluator: 'llm',
    };
  } catch (error) {
    console.warn('[DiscussionRespond] Evaluation fallback triggered', error);
    return {
      coveredGoals: [],
      assessments: goalRefs.map((goalId) => ({
        goalId,
        satisfied: false,
        notes: 'Evaluation fallback: tidak dapat menilai secara otomatis.',
      })),
      coachFeedback:
        'Terima kasih atas jawabanmu. Mari kita ulas kembali poin pentingnya dan pastikan sudah sesuai dengan tujuan.',
      evaluator: 'fallback',
    };
  }
}

function buildDefaultClosingMessage(goals: DiscussionGoalState[]) {
  const accomplished = goals
    .filter((goal) => goal.covered)
    .map((goal) => `- ${goal.description}`)
    .join('\n');
  const pending = goals
    .filter((goal) => !goal.covered)
    .map((goal) => `- ${goal.description}`)
    .join('\n');

  if (pending) {
    return [
      'Terima kasih untuk tanggapanmu. Ada beberapa poin yang masih bisa kamu perdalam:',
      pending ? `Fokuskan ulang pada:\n${pending}` : '',
      'Silakan tinjau kembali materi di atas sebelum melanjutkan, lalu kembali ke sesi diskusi kapan saja untuk menyempurnakan pemahamanmu.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    'Hebat! Kamu sudah menuntaskan seluruh tujuan diskusi untuk subtopik ini.',
    accomplished ? `Poin yang sudah kamu kuasai:\n${accomplished}` : '',
    'Jika ingin memperdalam lagi, kamu bisa mencoba menerapkan konsep ini pada situasi nyata atau melanjutkan ke materi berikutnya.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function ensureProgressRecord(userId: string, courseId: string, subtopicId: string) {
  try {
    const { data, error } = await adminDb
      .from('user_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('subtopic_id', subtopicId)
      .limit(1);

    if (error) {
      console.warn('[DiscussionRespond] Failed to check progress', error);
      return;
    }

    if (!data || data.length === 0) {
      const { error: insertError } = await adminDb
        .from('user_progress')
        .insert({
          user_id: userId,
          course_id: courseId,
          subtopic_id: subtopicId,
          is_completed: false,
        });

      if (insertError) {
        console.warn('[DiscussionRespond] Failed to insert progress', insertError);
      }
    }
  } catch (progressError) {
    console.warn('[DiscussionRespond] ensureProgressRecord error', progressError);
  }
}

async function markProgressCompleted(userId: string, courseId: string, subtopicId: string) {
  try {
    const now = new Date().toISOString();
    const { data, error } = await adminDb
      .from('user_progress')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('subtopic_id', subtopicId)
      .limit(1);

    if (error) {
      console.warn('[DiscussionRespond] Failed to fetch progress for completion', error);
      return;
    }

    if (!data || data.length === 0) {
      const { error: insertError } = await adminDb
        .from('user_progress')
        .insert({
          user_id: userId,
          course_id: courseId,
          subtopic_id: subtopicId,
          is_completed: true,
          completion_date: now,
        });

      if (insertError) {
        console.warn('[DiscussionRespond] Failed to insert completed progress', insertError);
      }
    } else {
      const { error: updateError } = await adminDb
        .from('user_progress')
        .update({
          is_completed: true,
          completion_date: now,
        })
        .eq('id', data[0].id);

      if (updateError) {
        console.warn('[DiscussionRespond] Failed to update progress completion', updateError);
      }
    }
  } catch (completionError) {
    console.warn('[DiscussionRespond] markProgressCompleted error', completionError);
  }
}
