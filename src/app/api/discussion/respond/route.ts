import { NextRequest, NextResponse, after } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb, publicDb } from '@/lib/database';
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
  learning_goals: unknown;
  template_id: string | null;
  subtopic_id: string;
  course_id: string;
}

interface DiscussionStep {
  key: string;
  prompt: string;
  expected_type?: string;
  options?: string[];
  goal_refs?: string[];
  answer?: string | number;
  feedback?: { correct?: string; incorrect?: string };
}

interface DiscussionTemplate {
  phases?: Array<{
    id?: string;
    steps?: Array<DiscussionStep>;
  }>;
  closing_message?: string;
  learning_goals?: Array<{
    id?: string;
    description?: string;
    rubric?: GoalRubric;
    thinking_skill?: unknown;
    thinkingSkill?: unknown;
  }>;
}

interface GoalRubric {
  success_summary?: string;
  checklist?: string[];
  failure_signals?: string[];
}

interface TemplateSource {
  summary?: string;
  keyTakeaways?: string[];
  learningObjectives?: string[];
  subtopicTitle?: string;
}

type TemplateRecord = {
  id: string;
  template: DiscussionTemplate;
  version: string;
  source?: TemplateSource;
};

interface DiscussionGoalState {
  id: string;
  description: string;
  rubric?: GoalRubric | null;
  covered: boolean;
  thinkingSkill?: ThinkingSkillMeta | null;
}

const MAX_ATTEMPTS_PER_STEP = 2; // 1 original + 1 retry
const MAX_CLARIFICATIONS_PER_STEP = 1;
const MAX_REMEDIATION_ROUNDS = 2;

// ── Helpers: attempt counting, effort detection, retry prompts ─────

function countStepAttempts(
  messages: Array<{ role: string; step_key?: string | null; metadata?: Record<string, unknown> | null }>,
  stepKey: string,
): number {
  return messages.filter((msg) => {
    if (msg.role !== 'student') return false;
    if (msg.step_key !== stepKey) return false;
    const qf = msg.metadata?.quality_flag as string | undefined;
    if (qf === 'low_effort' || qf === 'off_topic') return false;
    return true;
  }).length;
}

interface EffortCheck {
  pass: boolean;
  qualityFlag: 'adequate' | 'low_effort' | 'off_topic';
  rejectionMessage?: string;
}

function detectMinimumEffort(responseText: string, expectedType: string | undefined): EffortCheck {
  const trimmed = responseText.trim();

  if (expectedType === 'mcq') {
    return { pass: true, qualityFlag: 'adequate' };
  }

  if (trimmed.length < 10) {
    return {
      pass: false,
      qualityFlag: 'low_effort',
      rejectionMessage:
        'Jawaban terlalu singkat. Cobalah jelaskan pemikiran Anda secara lebih rinci agar kami dapat menilai pemahaman Anda.',
    };
  }

  const lowEffortPatterns = [
    /^(saya )?(tidak|gak|ga|nggak|ndak) (tahu|tau|paham|mengerti|ngerti)\.?$/i,
    /^(idk|dunno|i don'?t know|no idea)\.?$/i,
    /^(entahlah|gatau|gaktau|ntah)\.?$/i,
    /^[a-zA-Z0-9]{1,3}$/,
    /^(ya|tidak|iya|enggak|ok|oke|okay)\.?$/i,
  ];

  for (const pattern of lowEffortPatterns) {
    if (pattern.test(trimmed)) {
      return {
        pass: false,
        qualityFlag: 'low_effort',
        rejectionMessage:
          'Jawaban ini belum cukup untuk menilai pemahaman Anda. Cobalah menjelaskan dengan kata-kata sendiri — tidak perlu sempurna, yang penting jujur dan lengkap.',
      };
    }
  }

  return { pass: true, qualityFlag: 'adequate' };
}

function buildRetryPrompt(step: DiscussionStep, evaluation: StepEvaluationResult): string {
  const isMcq = step.expected_type === 'mcq' || Boolean(step.options?.length);

  if (isMcq) {
    return 'Jawaban sebelumnya belum tepat. Coba pikirkan kembali — perhatikan konsep utama yang dibahas sebelumnya, lalu pilih jawaban yang paling sesuai.';
  }

  const hint = evaluation.coachFeedback
    ? `\n\nPetunjuk dari evaluasi sebelumnya: ${evaluation.coachFeedback}`
    : '';

  return (
    `Mari coba lagi. Pertanyaannya tetap sama:\n\n"${step.prompt}"` +
    hint +
    '\n\nCobalah jawab dengan lebih detail dan pastikan jawabanmu mencakup poin-poin utama yang diminta.'
  );
}

// ── Counter-question detection ────────────────────────────────────

interface CounterQuestionCheck {
  isCounterQuestion: boolean;
  isDeflection: boolean;
}

function detectCounterQuestion(responseText: string): CounterQuestionCheck {
  const trimmed = responseText.trim();

  // Must contain a question mark
  if (!trimmed.includes('?')) {
    return { isCounterQuestion: false, isDeflection: false };
  }

  // Check if it STARTS with a question word (strong signal)
  const questionStarters = /^(apa|bagaimana|kenapa|mengapa|apakah|bisakah|bolehkah|siapa|dimana|kapan|berapa|what|why|how|can|could|is|are|do|does)/i;
  const startsWithQuestion = questionStarters.test(trimmed);

  // Check if it contains answer-like indicators (negates counter-question)
  const answerIndicators = /\b(menurut saya|menurut aku|saya pikir|saya rasa|jadi|karena|sehingga|oleh karena|maka|kesimpulannya|dengan demikian|i think|i believe|because|therefore)\b/i;
  const hasAnswerContent = answerIndicators.test(trimmed);

  // If has answer content AND question, it's likely an answer with a follow-up — treat as answer
  if (hasAnswerContent) {
    return { isCounterQuestion: false, isDeflection: false };
  }

  // Only a question, no answer content
  if (startsWithQuestion) {
    // Check for deflection patterns
    const deflectionPatterns = [
      /^(kenapa|mengapa) (harus|perlu|saya harus)/i,
      /^(bisakah|bolehkah) (kamu|anda|ai|sistem) (saja|aja)/i,
      /^(ga|gak|tidak) (mau|usah)/i,
    ];
    const isDeflection = deflectionPatterns.some(p => p.test(trimmed));
    return { isCounterQuestion: true, isDeflection };
  }

  // Ends with question mark but doesn't start with question word — borderline
  // Check sentence count: if only 1 sentence and it's a question, likely counter-question
  const sentences = trimmed.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length <= 1) {
    return { isCounterQuestion: true, isDeflection: false };
  }

  return { isCounterQuestion: false, isDeflection: false };
}

function countStepClarifications(
  messages: Array<{ role: string; metadata?: Record<string, unknown> | null }>,
  stepKey: string,
): number {
  return messages.filter((msg) => {
    if (msg.role !== 'agent') return false;
    const type = msg.metadata?.type as string | undefined;
    return type === 'clarification_response' && msg.metadata?.original_step_key === stepKey;
  }).length;
}

async function generateClarification(
  studentQuestion: string,
  originalPrompt: string,
  templateSource: TemplateSource | undefined,
): Promise<string> {
  try {
    const contextSummary = templateSource?.summary || '';
    const keyTakeaways = Array.isArray(templateSource?.keyTakeaways)
      ? templateSource.keyTakeaways.join(', ')
      : '';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const completion = await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        max_completion_tokens: 400,
        messages: [
          {
            role: 'system',
            content: 'Kamu adalah fasilitator pembelajaran. Seorang mahasiswa mengajukan pertanyaan klarifikasi saat sesi diskusi. Jawab pertanyaannya secara singkat dan jelas (2-4 kalimat) menggunakan konteks materi yang diberikan. Setelah menjawab, arahkan kembali ke pertanyaan diskusi yang asli.',
          },
          {
            role: 'user',
            content: [
              `Konteks materi: ${contextSummary}`,
              keyTakeaways ? `Poin penting: ${keyTakeaways}` : '',
              '',
              `Pertanyaan diskusi yang seharusnya dijawab: "${originalPrompt}"`,
              `Pertanyaan klarifikasi dari mahasiswa: "${studentQuestion}"`,
              '',
              'Jawab pertanyaan klarifikasinya, lalu arahkan kembali untuk menjawab pertanyaan diskusi.',
            ].filter(Boolean).join('\n'),
          },
        ],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const answer = completion.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      return `Pertanyaan yang bagus. Untuk saat ini, cobalah jawab pertanyaan diskusi berdasarkan pemahamanmu:\n\n"${originalPrompt}"`;
    }

    return answer;
  } catch (err) {
    console.warn('[Discussion] Clarification generation failed:', err);
    return `Terima kasih atas pertanyaanmu. Cobalah jawab pertanyaan diskusi berdasarkan pemahamanmu saat ini:\n\n"${originalPrompt}"`;
  }
}

// ── Remediation helpers ───────────────────────────────────────────

function countRemediationRounds(
  messages: Array<{ metadata?: Record<string, unknown> | null }>,
): number {
  return messages.filter((msg) => {
    const type = msg.metadata?.type as string | undefined;
    return type === 'remediation_prompt';
  }).length;
}

async function generateRemediationQuestion(
  uncoveredGoals: DiscussionGoalState[],
  templateSource: TemplateSource | undefined,
  remediationRound: number,
): Promise<string> {
  try {
    const goalsText = uncoveredGoals
      .map((g) => `- ${g.description}`)
      .join('\n');

    const contextSummary = templateSource?.summary || '';
    const scaffoldingLevel = remediationRound === 1
      ? 'Ajukan pertanyaan dari sudut pandang berbeda, tetap menantang tetapi lebih spesifik.'
      : 'Ajukan pertanyaan yang lebih terbimbing dengan petunjuk/scaffolding yang jelas. Berikan konteks tambahan dalam pertanyaan.';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const completion = await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        max_completion_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `Kamu adalah fasilitator pembelajaran Socratic. Mahasiswa belum berhasil mencapai beberapa tujuan pembelajaran dalam diskusi sebelumnya. Tugasmu adalah membuat SATU pertanyaan baru yang mencakup semua tujuan yang belum tercapai. ${scaffoldingLevel} Pertanyaan harus dalam Bahasa Indonesia dan bersifat open-ended.`,
          },
          {
            role: 'user',
            content: [
              `Konteks materi: ${contextSummary}`,
              '',
              `Tujuan yang belum tercapai (remediation round ${remediationRound}):`,
              goalsText,
              '',
              'Buat SATU pertanyaan yang menguji pemahaman mahasiswa terhadap semua tujuan di atas. Hanya berikan pertanyaannya saja, tanpa pengantar.',
            ].join('\n'),
          },
        ],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const question = completion.choices?.[0]?.message?.content?.trim();
    if (!question) {
      return `Mari kita bahas kembali beberapa poin yang belum tercapai. Jelaskan pemahamanmu tentang: ${uncoveredGoals.map(g => g.description).join('; ')}`;
    }

    return question;
  } catch (err) {
    console.warn('[Discussion] Remediation question generation failed:', err);
    return `Mari kita bahas kembali beberapa poin yang belum tercapai. Jelaskan pemahamanmu tentang: ${uncoveredGoals.map(g => g.description).join('; ')}`;
  }
}

type DiscussionMessagePayload = {
  session_id: string;
  role: 'agent' | 'student';
  content: string;
  step_key?: string | null;
  metadata?: Record<string, unknown>;
};

async function insertDiscussionMessage(payload: DiscussionMessagePayload) {
  const { error } = await adminDb.from('discussion_messages').insert(payload);
  if (error) {
    const msg = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : String(error);
    throw new Error(`Failed to insert discussion message: ${msg}`);
  }
}

/**
 * Atomically insert a batch of discussion messages in a single Supabase
 * round-trip. The Supabase JS SDK does not expose multi-statement
 * transactions, but a single `.insert([...])` call is executed as one
 * atomic INSERT on the Postgres side: either every row lands or none do.
 * This lets us avoid the "student message saved, agent response orphaned"
 * failure mode when a subsequent step errors out.
 */
async function insertDiscussionMessagesBatch(messages: DiscussionMessagePayload[]) {
  if (!messages.length) return;
  const { error } = await adminDb.from('discussion_messages').insert(messages);
  if (error) {
    const msg = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : String(error);
    throw new Error(`Failed to insert discussion messages batch: ${msg}`);
  }
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
      (msg: { role: string; metadata?: { type?: string } }) =>
        msg.role === 'agent' &&
        (!msg.metadata ||
          (msg.metadata.type !== 'coach_feedback' &&
           msg.metadata.type !== 'closing' &&
           msg.metadata.type !== 'retry_prompt' &&
           msg.metadata.type !== 'effort_rejection' &&
           msg.metadata.type !== 'remediation_prompt' &&
           msg.metadata.type !== 'clarification_response'))
    );
    const currentStepIndex =
      agentMessages.length > 0 ? Math.min(agentMessages.length - 1, steps.length - 1) : 0;
    const currentStep = steps[currentStepIndex] ?? steps[0];

    // Check if we're in remediation mode (past template steps)
    type RawMessage = {
      role: string;
      content: string;
      step_key?: string | null;
      metadata?: Record<string, unknown> | null;
    };
    const lastAgentMsg = (messages as RawMessage[])
      .filter((m) => m.role === 'agent')
      .pop();
    const isRemediationStep = lastAgentMsg?.metadata?.type === 'remediation_prompt';

    let activeStep = currentStep;
    if (isRemediationStep && lastAgentMsg) {
      // Use remediation prompt as the "step"
      const targetGoalIds = (lastAgentMsg.metadata?.target_goal_ids as string[]) || [];
      activeStep = {
        phaseId: 'remediation',
        step: {
          key: lastAgentMsg.step_key || `remediation-${lastAgentMsg.metadata?.remediation_round || 1}`,
          prompt: lastAgentMsg.content,
          expected_type: 'open',
          goal_refs: targetGoalIds,
        },
      };
    }

    const trimmedAnswer = message.trim();

    // ── STEP 1: Pre-check minimum effort (before LLM call) ──
    const effortCheck = detectMinimumEffort(trimmedAnswer, activeStep?.step?.expected_type);

    if (!effortCheck.pass) {
      await insertDiscussionMessage({
        session_id: session.id,
        role: 'student',
        content: trimmedAnswer,
        step_key: activeStep?.step?.key ?? null,
        metadata: { type: 'student_input', phase: activeStep?.phaseId ?? null, quality_flag: effortCheck.qualityFlag },
      });

      await insertDiscussionMessage({
        session_id: session.id,
        role: 'agent',
        content: effortCheck.rejectionMessage!,
        step_key: activeStep?.step?.key ? `${activeStep.step.key}-effort` : 'effort-check',
        metadata: { type: 'effort_rejection', quality_flag: effortCheck.qualityFlag },
      });

      const updatedMessages = await fetchMessages(session.id);
      return NextResponse.json({
        session: { id: session.id, status: 'in_progress', phase: session.phase, learningGoals: normalizeGoals(session.learning_goals) },
        messages: updatedMessages,
        nextStep: { key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId },
        effortRejection: true,
      });
    }

    // ── STEP 1b: Counter-question detection ──
    const counterCheck = detectCounterQuestion(trimmedAnswer);

    if (counterCheck.isCounterQuestion) {
      if (counterCheck.isDeflection) {
        // Deflection — ask them to try answering
        await insertDiscussionMessage({
          session_id: session.id,
          role: 'student',
          content: trimmedAnswer,
          step_key: activeStep?.step?.key ?? null,
          metadata: { type: 'student_input', phase: activeStep?.phaseId ?? null, quality_flag: 'deflection' },
        });

        await insertDiscussionMessage({
          session_id: session.id,
          role: 'agent',
          content: 'Cobalah menjawab pertanyaan terlebih dahulu berdasarkan pemahamanmu saat ini. Tidak perlu sempurna — yang penting kamu mencoba berpikir dan menjelaskan dengan kata-katamu sendiri.',
          step_key: activeStep?.step?.key ? `${activeStep.step.key}-deflection` : 'deflection',
          metadata: { type: 'effort_rejection', quality_flag: 'deflection' },
        });

        const updatedMessages = await fetchMessages(session.id);
        return NextResponse.json({
          session: { id: session.id, status: 'in_progress', phase: session.phase, learningGoals: normalizeGoals(session.learning_goals) },
          messages: updatedMessages,
          nextStep: { key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId },
          effortRejection: true,
        });
      }

      // Genuine clarification — check cap
      const priorClarifications = countStepClarifications(messages, activeStep?.step?.key ?? '');

      if (priorClarifications < MAX_CLARIFICATIONS_PER_STEP) {
        // Save student question
        await insertDiscussionMessage({
          session_id: session.id,
          role: 'student',
          content: trimmedAnswer,
          step_key: activeStep?.step?.key ?? null,
          metadata: { type: 'student_input', phase: activeStep?.phaseId ?? null, quality_flag: 'counter_question' },
        });

        // Generate clarification
        const clarificationText = await generateClarification(
          trimmedAnswer,
          activeStep.step.prompt,
          templateRow.source,
        );

        await insertDiscussionMessage({
          session_id: session.id,
          role: 'agent',
          content: clarificationText,
          step_key: activeStep?.step?.key ? `${activeStep.step.key}-clarification` : 'clarification',
          metadata: {
            type: 'clarification_response',
            phase: activeStep.phaseId,
            original_step_key: activeStep.step.key,
            expected_type: activeStep.step.expected_type ?? 'open',
            options: activeStep.step.options ?? [],
          },
        });

        const updatedMessages = await fetchMessages(session.id);
        return NextResponse.json({
          session: { id: session.id, status: 'in_progress', phase: session.phase, learningGoals: normalizeGoals(session.learning_goals) },
          messages: updatedMessages,
          nextStep: { key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId },
          clarificationGiven: true,
        });
      }
      // If clarification cap reached, fall through to normal evaluation
    }

    // ── STEP 2: Count prior real attempts for this step ──
    const priorAttempts = countStepAttempts(messages, activeStep?.step?.key ?? '');
    const currentAttemptNumber = priorAttempts + 1;

    // ── STEP 3: Normal evaluation ──
    let learningGoals = mergeGoalDetails(
      normalizeGoals(session.learning_goals),
      templateRow.template?.learning_goals
    );

    // ── Atomic-flow pattern (Option A) ──
    // The Supabase JS SDK does not expose multi-statement transactions, so we
    // avoid orphaned writes by (1) calling ALL AI endpoints first, (2) building
    // a single pre-computed batch containing every message this turn produces,
    // (3) inserting that batch in one `.insert([...])` call, and (4) updating
    // the session row last. If any AI or preparation step throws, we exit the
    // handler BEFORE any message has been written to the database.
    const evaluation = await evaluateStepResponse({
      responseText: trimmedAnswer,
      step: activeStep?.step,
      templateGoals: templateRow.template?.learning_goals,
      templateSource: templateRow.source,
      currentGoals: learningGoals,
    });

    const studentMessagePayload: DiscussionMessagePayload = {
      session_id: session.id,
      role: 'student',
      content: trimmedAnswer,
      step_key: activeStep?.step?.key ?? null,
      metadata: {
        type: 'student_input',
        phase: activeStep?.phaseId ?? null,
        evaluation,
        quality_flag: evaluation.qualityFlag ?? 'adequate',
        attempt_number: currentAttemptNumber,
      },
    };

    const coachFeedbackMessagePayload: DiscussionMessagePayload | null = evaluation.coachFeedback
      ? {
          session_id: session.id,
          role: 'agent',
          content: evaluation.coachFeedback,
          step_key: activeStep?.step?.key ? `${activeStep.step.key}-feedback` : 'feedback',
          metadata: { type: 'coach_feedback', assessments: evaluation.assessments ?? [] },
        }
      : null;

    // ── STEP 4: Handle LLM-detected low quality ──
    if (evaluation.qualityFlag === 'off_topic' || evaluation.qualityFlag === 'low_effort') {
      const batch: DiscussionMessagePayload[] = [studentMessagePayload];
      if (coachFeedbackMessagePayload) batch.push(coachFeedbackMessagePayload);
      await insertDiscussionMessagesBatch(batch);

      const updatedMessages = await fetchMessages(session.id);
      return NextResponse.json({
        session: { id: session.id, status: 'in_progress', phase: session.phase, learningGoals },
        messages: updatedMessages,
        nextStep: { key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId },
        effortRejection: true,
      });
    }

    // ── STEP 5: Update goal coverage ──
    const coveredSet = new Set(evaluation.coveredGoals);
    learningGoals = learningGoals.map((goal) =>
      coveredSet.has(goal.id) ? { ...goal, covered: true } : goal
    );

    const allGoalsCovered =
      learningGoals.length > 0 && learningGoals.every((goal) => goal.covered === true);

    // ── STEP 6: Retry vs Advance decision ──
    const stepGoalRefs: string[] = Array.isArray(activeStep?.step?.goal_refs)
      ? activeStep.step.goal_refs.filter(Boolean)
      : [];

    const stepGoalsSatisfied =
      stepGoalRefs.length === 0 ||
      stepGoalRefs.every((goalId) => learningGoals.find((g) => g.id === goalId)?.covered);

    const shouldRetry =
      !stepGoalsSatisfied &&
      !allGoalsCovered &&
      currentAttemptNumber < MAX_ATTEMPTS_PER_STEP;

    // Helper: deferred cognitive scoring
    const deferCognitiveScoring = () => {
      after(async () => {
        try {
          const { data: latestStudentMsg } = await adminDb
            .from('discussion_messages')
            .select('id')
            .eq('session_id', session.id)
            .eq('role', 'student')
            .order('created_at', { ascending: false })
            .limit(1);
          const studentMsgId = latestStudentMsg?.[0]?.id ?? null;
          const { scoreAndSave } = await import('@/services/cognitive-scoring.service');
          await scoreAndSave({
            source: 'discussion',
            user_id: tokenPayload.userId,
            course_id: session.course_id,
            source_id: studentMsgId,
            user_text: trimmedAnswer,
            prompt_or_question: activeStep?.step?.prompt || 'Discussion step',
          });
        } catch (scoreError) {
          console.warn('[Discussion] 12-indicator scoring failed:', scoreError);
        }
      });
    };

    if (shouldRetry) {
      // ── RETRY: Stay on the same step ──
      const retryPromptText = buildRetryPrompt(activeStep.step, evaluation);

      // Atomic batch: student input + optional coach feedback + retry prompt.
      const retryBatch: DiscussionMessagePayload[] = [studentMessagePayload];
      if (coachFeedbackMessagePayload) retryBatch.push(coachFeedbackMessagePayload);
      retryBatch.push({
        session_id: session.id,
        role: 'agent',
        content: retryPromptText,
        step_key: activeStep.step.key ? `${activeStep.step.key}-retry` : 'retry',
        metadata: {
          type: 'retry_prompt',
          phase: activeStep.phaseId,
          expected_type: activeStep.step.expected_type ?? 'open',
          options: activeStep.step.options ?? [],
          attempt_number: currentAttemptNumber + 1,
          original_step_key: activeStep.step.key,
        },
      });
      await insertDiscussionMessagesBatch(retryBatch);

      const { error: retryUpdateError } = await adminDb
        .from('discussion_sessions')
        .eq('id', session.id)
        .update({ learning_goals: learningGoals });

      if (retryUpdateError) {
        throw new Error(`Failed to update goals during retry: ${retryUpdateError.message}`);
      }

      const updatedMessages = await fetchMessages(session.id);
      deferCognitiveScoring();

      return NextResponse.json({
        session: { id: session.id, status: 'in_progress', phase: activeStep.phaseId, learningGoals },
        messages: updatedMessages,
        nextStep: { key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId },
        isRetry: true,
        attemptNumber: currentAttemptNumber,
        maxAttempts: MAX_ATTEMPTS_PER_STEP,
      });
    }

    // ── ADVANCE, REMEDIATE, or COMPLETE ──
    const nextStepCandidateIndex = currentStepIndex + 1;
    const hasMoreTemplateSteps = nextStepCandidateIndex < steps.length;

    if (!allGoalsCovered && hasMoreTemplateSteps && !isRemediationStep) {
      // ── ADVANCE to next template step ──
      const nextStep = steps[nextStepCandidateIndex];

      // Atomic batch: student input + optional coach feedback + next prompt.
      const advanceBatch: DiscussionMessagePayload[] = [studentMessagePayload];
      if (coachFeedbackMessagePayload) advanceBatch.push(coachFeedbackMessagePayload);
      advanceBatch.push({
        session_id: session.id,
        role: 'agent',
        content: nextStep.step.prompt,
        step_key: nextStep.step.key,
        metadata: {
          type: 'agent_response',
          phase: nextStep.phaseId,
          expected_type: nextStep.step.expected_type ?? 'open',
          options: nextStep.step.options ?? [],
        },
      });
      await insertDiscussionMessagesBatch(advanceBatch);

      const { error: phaseUpdateError } = await adminDb
        .from('discussion_sessions')
        .eq('id', session.id)
        .update({ phase: nextStep.phaseId, learning_goals: learningGoals });

      if (phaseUpdateError) {
        throw new Error(`Failed to update discussion phase: ${phaseUpdateError.message}`);
      }

      const updatedMessages = await fetchMessages(session.id);
      deferCognitiveScoring();

      return NextResponse.json({
        session: { id: session.id, status: 'in_progress', phase: nextStep.phaseId, learningGoals },
        messages: updatedMessages,
        nextStep: { key: nextStep.step.key, prompt: nextStep.step.prompt, expected_type: nextStep.step.expected_type ?? 'open', options: nextStep.step.options ?? [], phase: nextStep.phaseId },
      });
    }

    if (!allGoalsCovered && (!hasMoreTemplateSteps || isRemediationStep)) {
      // ── REMEDIATION: Template steps exhausted but goals remain ──
      const remediationRound = countRemediationRounds(messages) + 1;

      if (remediationRound <= MAX_REMEDIATION_ROUNDS) {
        const uncoveredGoals = learningGoals.filter((g) => !g.covered);
        const uncoveredGoalIds = uncoveredGoals.map((g) => g.id);

        // Call the second AI endpoint (generateRemediationQuestion) BEFORE any
        // DB writes so a failure here leaves no orphaned rows. The function
        // already has its own try/catch + fallback, but we keep the call
        // outside the batch for belt-and-suspenders atomicity.
        const remediationQuestion = await generateRemediationQuestion(
          uncoveredGoals,
          templateRow.source,
          remediationRound,
        );

        const remediationStepKey = `remediation-${remediationRound}`;

        // Atomic batch: student input + coach feedback + optional intro + remediation prompt.
        const remediationBatch: DiscussionMessagePayload[] = [studentMessagePayload];
        if (coachFeedbackMessagePayload) remediationBatch.push(coachFeedbackMessagePayload);

        // Transition message (only on first remediation round)
        if (remediationRound === 1) {
          remediationBatch.push({
            session_id: session.id,
            role: 'agent',
            content: `Ada ${uncoveredGoals.length} tujuan pembelajaran yang belum sepenuhnya tercapai. Mari kita bahas lebih lanjut agar pemahamanmu lebih lengkap.`,
            step_key: `remediation-intro-${remediationRound}`,
            metadata: { type: 'coach_feedback', phase: 'remediation' },
          });
        }

        remediationBatch.push({
          session_id: session.id,
          role: 'agent',
          content: remediationQuestion,
          step_key: remediationStepKey,
          metadata: {
            type: 'remediation_prompt',
            phase: 'remediation',
            expected_type: 'open',
            options: [],
            remediation_round: remediationRound,
            target_goal_ids: uncoveredGoalIds,
          },
        });

        await insertDiscussionMessagesBatch(remediationBatch);

        const { error: remUpdateError } = await adminDb
          .from('discussion_sessions')
          .eq('id', session.id)
          .update({ phase: 'remediation', learning_goals: learningGoals });

        if (remUpdateError) {
          throw new Error(`Failed to update session for remediation: ${remUpdateError.message}`);
        }

        const updatedMessages = await fetchMessages(session.id);
        deferCognitiveScoring();

        return NextResponse.json({
          session: { id: session.id, status: 'in_progress', phase: 'remediation', learningGoals },
          messages: updatedMessages,
          nextStep: { key: remediationStepKey, prompt: remediationQuestion, expected_type: 'open', options: [], phase: 'remediation' },
          isRemediation: true,
          remediationRound,
          maxRemediationRounds: MAX_REMEDIATION_ROUNDS,
        });
      }
    }

    // ── SESSION COMPLETION (all goals covered OR max remediation exhausted) ──
    const closingMessage = buildDefaultClosingMessage(learningGoals);

    // Atomic batch: student input + optional coach feedback + closing message.
    const completionBatch: DiscussionMessagePayload[] = [studentMessagePayload];
    if (coachFeedbackMessagePayload) completionBatch.push(coachFeedbackMessagePayload);
    completionBatch.push({
      session_id: session.id,
      role: 'agent',
      content: closingMessage,
      step_key: 'closing',
      metadata: { type: 'closing', goals: learningGoals },
    });
    await insertDiscussionMessagesBatch(completionBatch);

    const { error: completionUpdateError } = await adminDb
      .from('discussion_sessions')
      .eq('id', session.id)
      .update({ phase: 'completed', status: 'completed', learning_goals: learningGoals });

    if (completionUpdateError) {
      throw new Error(`Failed to complete discussion session: ${completionUpdateError.message}`);
    }

    await markProgressCompleted(session.user_id, session.course_id, session.subtopic_id);

    const updatedMessages = await fetchMessages(session.id);
    deferCognitiveScoring();

    return NextResponse.json({
      session: { id: session.id, status: 'completed', phase: 'completed', learningGoals },
      messages: updatedMessages,
      nextStep: null,
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
    const { data, error } = await publicDb
      .from('discussion_templates')
      .select('id, template, version, source')
      .eq('id', session.template_id)
      .limit(1);

    if (!error && data?.[0]) {
      return data[0];
    }
  }

  const { data, error } = await publicDb
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

function flattenTemplate(template: DiscussionTemplate | null | undefined) {
  const phases = Array.isArray(template?.phases) ? template.phases : [];
  const flattened: Array<{ phaseId: string; step: DiscussionStep }> = [];

  phases.forEach((phase) => {
    const steps = Array.isArray(phase?.steps) ? phase.steps : [];
    steps.forEach((step) => {
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

function normalizeGoals(goals: unknown): DiscussionGoalState[] {
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
  templateGoals: DiscussionTemplate['learning_goals']
) {
  const templateArray = Array.isArray(templateGoals) ? templateGoals : [];
  if (!templateArray.length) {
    return currentGoals;
  }
  const currentMap = new Map(currentGoals.map((goal) => [goal.id, goal]));

  const merged = templateArray.map((goal) => {
    const goalId = goal?.id ?? '';
    const existing = currentMap.get(goalId);
    return {
      id: goalId || existing?.id || '',
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
  qualityFlag?: 'adequate' | 'low_effort' | 'off_topic';
}

interface EvaluateStepParams {
  responseText: string;
  step?: DiscussionStep;
  templateGoals?: DiscussionTemplate['learning_goals'];
  templateSource?: TemplateSource;
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
          required: ['goalAssessments', 'qualityFlag'],
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
            qualityFlag: { type: 'string' },
          },
        },
      },
    } as const;

    const evaluationAbort = new AbortController();
    const evaluationTimeout = setTimeout(() => evaluationAbort.abort(), 30000);

    const completion = await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        response_format: evaluationSchema,
        max_completion_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You are a learning facilitator evaluating a learner’s response. Use the rubric to judge whether each goal is satisfied. Respond only with JSON that matches the required schema.",
          },
          {
            role: "user",
            content: [
              contextBlock ? contextBlock : "Ringkasan tidak tersedia.",
              "",
              "Goals yang dinilai:",
              goalsBlock,
              "",
              `Pertanyaan/Penugasan: ${step?.prompt ?? "-"}`,
              `Jawaban peserta: ${responseText}`,
              "",
              "INSTRUKSI PENILAIAN:",
              "1. Nilailah setiap goal dengan menandai satisfied true/false dan cantumkan catatan singkat.",
              "2. Buat coachFeedback ringkas (2-3 kalimat) dalam bahasa yang sama dengan materi.",
              "3. Tentukan qualityFlag:",
              "   - 'adequate': jawaban menunjukkan usaha nyata dan relevan dengan pertanyaan",
              "   - 'low_effort': jawaban terlalu dangkal, tidak informatif, atau hanya mengulangi pertanyaan",
              "   - 'off_topic': jawaban tidak berkaitan dengan pertanyaan atau materi yang dibahas",
              "   Jika qualityFlag bukan 'adequate', SEMUA goal harus ditandai satisfied: false.",
            ].join("\n"),
          },
        ],
      },
      { signal: evaluationAbort.signal },
    );

    clearTimeout(evaluationTimeout);

    const raw = completion.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(raw.trim() || '{}');

    const qualityFlag: 'adequate' | 'low_effort' | 'off_topic' =
      parsed.qualityFlag === 'low_effort' ? 'low_effort'
      : parsed.qualityFlag === 'off_topic' ? 'off_topic'
      : 'adequate';

    const goalAssessments = Array.isArray(parsed.goalAssessments)
      ? parsed.goalAssessments
        .filter((assessment: { goalId?: string; satisfied?: boolean; notes?: string }) => goalRefs.includes(assessment?.goalId ?? ''))
        .map((assessment: { goalId: string; satisfied: boolean; notes?: string }) => ({
          goalId: assessment.goalId,
          satisfied: qualityFlag === 'adequate' ? Boolean(assessment.satisfied) : false,
          notes: assessment.notes,
        }))
      : [];

    const coveredGoals = goalAssessments
      .filter((assessment: { goalId: string; satisfied: boolean; notes?: string }) => assessment.satisfied)
      .map((assessment: { goalId: string; satisfied: boolean; notes?: string }) => assessment.goalId);

    return {
      coveredGoals,
      assessments: goalAssessments,
      coachFeedback: parsed.coachFeedback,
      evaluator: 'llm',
      qualityFlag,
    };
  } catch (error) {
    console.warn("[DiscussionRespond] Evaluation fallback triggered", error);
    return {
      coveredGoals: [],
      assessments: goalRefs.map((goalId) => ({
        goalId,
        satisfied: false,
        notes: "Evaluation fallback: tidak dapat menilai secara otomatis.",
      })),
      coachFeedback:
        "Terima kasih atas jawabanmu. Mari kita ulas kembali poin pentingnya dan pastikan sudah sesuai dengan tujuan.",
      evaluator: "fallback",
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
      "Terima kasih untuk tanggapanmu. Ada beberapa poin yang masih bisa kamu perdalam:",
      pending ? `Fokuskan ulang pada:\n${pending}` : "",
      "Silakan tinjau kembali materi di atas sebelum melanjutkan, lalu kembali ke sesi diskusi kapan saja untuk menyempurnakan pemahamanmu.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return [
    "Hebat! Kamu sudah menuntaskan seluruh tujuan diskusi untuk subtopik ini.",
    accomplished ? `Poin yang sudah kamu kuasai:\n${accomplished}` : "",
    "Jika ingin memperdalam lagi, kamu bisa mencoba menerapkan konsep ini pada situasi nyata atau melanjutkan ke materi berikutnya.",
  ]
    .filter(Boolean)
    .join("\n\n");
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
          completed_at: now,
        });

      if (insertError) {
        console.warn('[DiscussionRespond] Failed to insert completed progress', insertError);
      }
    } else {
      const { error: updateError } = await adminDb
        .from('user_progress')
        .eq('id', data[0].id)
        .update({
          is_completed: true,
          completed_at: now,
        });

      if (updateError) {
        console.warn('[DiscussionRespond] Failed to update progress completion', updateError);
      }
    }
  } catch (completionError) {
    console.warn('[DiscussionRespond] markProgressCompleted error', completionError);
  }
}
