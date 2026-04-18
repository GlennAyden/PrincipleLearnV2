import { NextRequest, NextResponse, after } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { openai, defaultOpenAIModel } from '@/lib/openai';
import { withApiLogging } from '@/lib/api-logger';
import {
  serializeDiscussionMessages,
  serializeDiscussionStep,
} from '@/lib/discussion/serializers';
import {
  ThinkingSkillMeta,
  normalizeThinkingSkillMeta,
} from '@/lib/discussion/thinkingSkills';
import {
  refreshResearchSessionMetrics,
  resolveResearchLearningSession,
  syncResearchEvidenceItem,
} from '@/services/research-session.service';

interface SessionRecord {
  id: string;
  user_id: string;
  status: string;
  phase: string;
  learning_goals: unknown;
  template_id: string | null;
  subtopic_id: string;
  course_id: string;
  learning_session_id?: string | null;
  data_collection_week?: string | null;
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
  generation?: {
    status?: string;
  };
}

type TemplateRecord = {
  id: string;
  template: DiscussionTemplate;
  version: string;
  source?: TemplateSource;
  generated_by?: string | null;
};

type GoalProximity = 'met' | 'near' | 'weak' | 'off_topic' | 'unassessable';
type GoalAcceptanceReason =
  | 'mastery'
  | 'near_enough'
  | 'attempt_limit'
  | 'remediation_attempt_limit'
  | 'not_accepted';

interface DiscussionGoalState {
  id: string;
  description: string;
  rubric?: GoalRubric | null;
  covered: boolean;
  thinkingSkill?: ThinkingSkillMeta | null;
  masteryStatus?: GoalProximity;
  assessmentScore?: number | null;
  assessmentNotes?: string | null;
  mentorNote?: string | null;
  modelAnswer?: string | null;
  acceptedBy?: GoalAcceptanceReason | null;
  acceptedAt?: string | null;
  lastAssessedStepKey?: string | null;
  lastAttemptNumber?: number | null;
}

const MAX_ATTEMPTS_PER_STEP = 2; // 1 original + 1 retry
const MAX_CLARIFICATIONS_PER_STEP = 1;

// ── Helpers: attempt counting, effort detection, retry prompts ─────

function countStepAttempts(
  messages: Array<{ role: string; step_key?: string | null; metadata?: Record<string, unknown> | null }>,
  stepKey: string,
): number {
  return messages.filter((msg) => {
    if (msg.role !== 'student') return false;
    if (msg.step_key !== stepKey) return false;
    const type = msg.metadata?.type as string | undefined;
    if (type && type !== 'student_input') return false;
    const qf = msg.metadata?.quality_flag as string | undefined;
    if (qf === 'counter_question' || qf === 'deflection') return false;
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
  const firstAssessment = evaluation.assessments?.find((item) => !item.accepted);
  const modelAnswer = firstAssessment?.modelAnswer?.trim();
  const mentorNote = firstAssessment?.mentorNote?.trim() || firstAssessment?.notes?.trim();

  if (isMcq) {
    return [
      'Jawabanmu belum pas, tetapi ini bisa kita pakai untuk memperjelas konsepnya.',
      mentorNote ? `Petunjuk: ${mentorNote}` : '',
      modelAnswer ? `Arah jawaban yang lebih tepat: ${modelAnswer}` : '',
      'Coba lihat kembali pilihan yang tersedia, lalu pilih jawaban yang paling sesuai dengan peran MC profesional.',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  return [
    'Aku menangkap usaha berpikirmu, tetapi jawabanmu masih perlu diarahkan sedikit lagi.',
    mentorNote ? `Bagian yang perlu diperbaiki: ${mentorNote}` : '',
    modelAnswer ? `Contoh arah jawaban yang lebih kuat: ${modelAnswer}` : '',
    `Sekarang coba jawab lagi dengan kata-katamu sendiri:\n\n"${step.prompt}"`,
  ]
    .filter(Boolean)
    .join('\n\n');
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
  targetGoal: DiscussionGoalState,
  templateSource: TemplateSource | undefined,
  remediationRound: number,
): Promise<string> {
  try {
    const contextSummary = templateSource?.summary || '';
    const scaffoldingLevel = remediationRound === 1
      ? 'Ajukan pertanyaan sederhana yang membantu mahasiswa menghubungkan jawabannya dengan konsep utama.'
      : 'Ajukan pertanyaan yang lebih terbimbing dengan petunjuk/scaffolding yang jelas dan contoh konteks singkat.';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const completion = await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        max_completion_tokens: 500,
        messages: [
          {
            role: 'system',
            content: `Kamu adalah fasilitator pembelajaran Socratic. Mahasiswa belum cukup kuat pada satu tujuan pembelajaran. Tugasmu adalah membuat SATU pertanyaan baru yang hanya menarget tujuan tersebut. ${scaffoldingLevel} Pertanyaan harus dalam Bahasa Indonesia, open-ended, dan terasa membimbing.`,
          },
          {
            role: 'user',
            content: [
              `Konteks materi: ${contextSummary}`,
              '',
              `Tujuan yang sedang dibimbing (remediation round ${remediationRound}):`,
              `- ${targetGoal.description}`,
              targetGoal.assessmentNotes ? `Catatan penilaian terakhir: ${targetGoal.assessmentNotes}` : '',
              targetGoal.modelAnswer ? `Arah jawaban ideal: ${targetGoal.modelAnswer}` : '',
              '',
              'Buat SATU pertanyaan scaffolding yang membantu mahasiswa memperbaiki pemahamannya. Hanya berikan pertanyaannya saja, tanpa pengantar.',
            ].filter(Boolean).join('\n'),
          },
        ],
      },
      { signal: controller.signal },
    );

    clearTimeout(timeout);

    const question = completion.choices?.[0]?.message?.content?.trim();
    if (!question) {
      return `Mari kita bahas satu bagian dulu. Dengan kata-katamu sendiri, jelaskan: ${targetGoal.description}`;
    }

    return question;
  } catch (err) {
    console.warn('[Discussion] Remediation question generation failed:', err);
    return `Mari kita bahas satu bagian dulu. Dengan kata-katamu sendiri, jelaskan: ${targetGoal.description}`;
  }
}

type DiscussionMessagePayload = {
  session_id: string;
  role: 'agent' | 'student';
  content: string;
  step_key?: string | null;
  metadata?: Record<string, unknown>;
  learning_session_id?: string | null;
  research_validity_status?: string;
  coding_status?: string;
  raw_evidence_snapshot?: Record<string, unknown>;
  data_collection_week?: string | null;
};

type InsertedDiscussionMessage = {
  id: string;
  role: 'agent' | 'student';
  content: string;
  step_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DiscussionResearchContext = {
  userId: string;
  courseId: string;
  learningSessionId: string | null;
  dataCollectionWeek: string | null;
};

const discussionResearchContextCache = new Map<string, Promise<DiscussionResearchContext | null>>();

async function getDiscussionResearchContext(sessionId: string): Promise<DiscussionResearchContext | null> {
  if (!discussionResearchContextCache.has(sessionId)) {
    discussionResearchContextCache.set(sessionId, (async () => {
      const { data: sessionRow, error } = await adminDb
        .from('discussion_sessions')
        .select('id, user_id, course_id, learning_session_id, data_collection_week')
        .eq('id', sessionId)
        .maybeSingle();

      if (error || !sessionRow) {
        console.warn('[DiscussionRespond] Failed to load discussion research context', error);
        return null;
      }

      const row = sessionRow as {
        user_id: string;
        course_id: string;
        learning_session_id?: string | null;
        data_collection_week?: string | null;
      };

      if (row.learning_session_id) {
        return {
          userId: row.user_id,
          courseId: row.course_id,
          learningSessionId: row.learning_session_id,
          dataCollectionWeek: row.data_collection_week ?? null,
        };
      }

      const researchSession = await resolveResearchLearningSession({
        userId: row.user_id,
        courseId: row.course_id,
      });

      if (researchSession.learningSessionId) {
        await adminDb
          .from('discussion_sessions')
          .eq('id', sessionId)
          .update({
            learning_session_id: researchSession.learningSessionId,
            data_collection_week: researchSession.dataCollectionWeek,
          });
      }

      return {
        userId: row.user_id,
        courseId: row.course_id,
        learningSessionId: researchSession.learningSessionId,
        dataCollectionWeek: researchSession.dataCollectionWeek,
      };
    })());
  }

  return discussionResearchContextCache.get(sessionId)!;
}

async function enrichDiscussionMessagePayload(payload: DiscussionMessagePayload): Promise<DiscussionMessagePayload> {
  const context = await getDiscussionResearchContext(payload.session_id);
  return {
    ...payload,
    learning_session_id: payload.learning_session_id ?? context?.learningSessionId ?? null,
    research_validity_status: payload.research_validity_status ?? 'valid',
    coding_status: payload.coding_status ?? 'uncoded',
    data_collection_week: payload.data_collection_week ?? context?.dataCollectionWeek ?? null,
    raw_evidence_snapshot: payload.raw_evidence_snapshot ?? {
      session_id: payload.session_id,
      role: payload.role,
      content: payload.content,
      step_key: payload.step_key ?? null,
      metadata: payload.metadata ?? {},
    },
  };
}

async function syncDiscussionMessageEvidence(messages: InsertedDiscussionMessage[], sessionId: string) {
  const context = await getDiscussionResearchContext(sessionId);
  if (!context) return;

  let synced = false;
  for (const message of messages) {
    if (message.role !== 'student') continue;

    await syncResearchEvidenceItem({
      sourceType: 'discussion',
      sourceId: message.id,
      sourceTable: 'discussion_messages',
      userId: context.userId,
      courseId: context.courseId,
      learningSessionId: context.learningSessionId,
      rmFocus: 'RM2_RM3',
      evidenceTitle: `Diskusi ${message.step_key ?? 'respons siswa'}`,
      evidenceText: message.content,
      evidenceStatus: 'raw',
      codingStatus: 'uncoded',
      researchValidityStatus: 'valid',
      dataCollectionWeek: context.dataCollectionWeek,
      evidenceSourceSummary: 'Jawaban siswa dalam sesi diskusi Socratic.',
      rawEvidenceSnapshot: {
        role: message.role,
        content: message.content,
        step_key: message.step_key,
        metadata: message.metadata ?? {},
      },
      metadata: {
        step_key: message.step_key,
        ...(message.metadata ?? {}),
      },
      createdAt: message.created_at,
    });
    synced = true;
  }

  if (synced) {
    await refreshResearchSessionMetrics(context.learningSessionId);
  }
}

async function insertDiscussionMessage(payload: DiscussionMessagePayload) {
  const enrichedPayload = await enrichDiscussionMessagePayload(payload);
  const { data, error } = await adminDb.from('discussion_messages').insert(enrichedPayload);
  if (error) {
    const msg = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : String(error);
    throw new Error(`Failed to insert discussion message: ${msg}`);
  }

  const inserted = Array.isArray(data) ? data[0] : data;
  if (inserted) {
    await syncDiscussionMessageEvidence([inserted as InsertedDiscussionMessage], payload.session_id);
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
async function insertDiscussionMessagesBatch(
  messages: DiscussionMessagePayload[]
): Promise<InsertedDiscussionMessage[]> {
  if (!messages.length) return [];
  const enrichedMessages = await Promise.all(messages.map(enrichDiscussionMessagePayload));
  const { data, error } = await adminDb
    .from('discussion_messages')
    .insert(enrichedMessages);
  if (error) {
    const msg = typeof error === 'object' && error !== null && 'message' in error
      ? (error as { message: string }).message
      : String(error);
    throw new Error(`Failed to insert discussion messages batch: ${msg}`);
  }
  const insertedMessages = (data ?? []) as InsertedDiscussionMessage[];
  await syncDiscussionMessageEvidence(insertedMessages, messages[0].session_id);
  return insertedMessages;
}

async function insertDiscussionAssessments(params: {
  session: SessionRecord;
  promptMessageId?: string | null;
  studentMessageId?: string | null;
  step: DiscussionStep;
  phase: string;
  evaluation: StepEvaluationResult;
  learningGoals: DiscussionGoalState[];
  attemptNumber: number;
  remediationRound?: number | null;
  scaffoldAction: string;
  advanceAllowed: boolean;
  coachFeedback?: string | null;
}) {
  if (!params.studentMessageId || !params.evaluation.assessments?.length) return;

  const rows = params.evaluation.assessments.map((assessment) => {
    const goal = params.learningGoals.find((item) => item.id === assessment.goalId);
    return {
    session_id: params.session.id,
    student_message_id: params.studentMessageId,
    prompt_message_id: params.promptMessageId ?? null,
    user_id: params.session.user_id,
    course_id: params.session.course_id,
    subtopic_id: params.session.subtopic_id,
    step_key: params.step.key ?? null,
    phase: params.phase,
    goal_id: assessment.goalId,
    goal_description: goal?.description ?? null,
    assessment_status: assessment.proximity,
    proximity_score: Math.round(assessment.score * 100),
    passed: assessment.accepted,
    attempt_number: params.attemptNumber,
    remediation_round: params.remediationRound ?? null,
    quality_flag: params.evaluation.qualityFlag ?? 'adequate',
    evaluator: params.evaluation.evaluator,
    model: defaultOpenAIModel,
    evaluation_version: 'discussion-proximity-v1',
    coach_feedback: params.coachFeedback ?? params.evaluation.coachFeedback ?? null,
    ideal_answer: assessment.modelAnswer ?? null,
    scaffold_action: params.scaffoldAction,
    advance_allowed: params.advanceAllowed,
    evidence_excerpt: assessment.evidence ?? null,
    assessment_raw: assessment,
    };
  });

  try {
    const { error } = await adminDb.from('discussion_assessments').upsert(rows, {
      onConflict: 'student_message_id,goal_id',
    });
    if (error) {
      console.warn('[DiscussionRespond] Failed to insert discussion assessments', error);
    }
  } catch (error) {
    console.warn('[DiscussionRespond] discussion_assessments write skipped', error);
  }
}

function findInsertedStudentMessage(
  insertedMessages: InsertedDiscussionMessage[],
  stepKey?: string | null,
) {
  return (
    insertedMessages.find(
      (message) => message.role === 'student' && message.step_key === (stepKey ?? null)
    ) ?? insertedMessages.find((message) => message.role === 'student') ?? null
  );
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
    if (!session.learning_session_id) {
      const researchSession = await resolveResearchLearningSession({
        userId: session.user_id,
        courseId: session.course_id,
      });
      if (researchSession.learningSessionId) {
        const { error: sessionResearchError } = await adminDb
          .from('discussion_sessions')
          .eq('id', session.id)
          .update({
            learning_session_id: researchSession.learningSessionId,
            data_collection_week: researchSession.dataCollectionWeek,
          });

        if (!sessionResearchError) {
          session.learning_session_id = researchSession.learningSessionId;
          session.data_collection_week = researchSession.dataCollectionWeek;
          discussionResearchContextCache.delete(session.id);
        }
      }
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
      id: string;
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
    const priorAttempts = countStepAttempts(messages, activeStep?.step?.key ?? '');
    const currentAttemptNumber = priorAttempts + 1;
    const hasReachedStepAttemptLimit = currentAttemptNumber >= MAX_ATTEMPTS_PER_STEP;

    // ── STEP 1: Pre-check minimum effort (before LLM call) ──
    const effortCheck = detectMinimumEffort(trimmedAnswer, activeStep?.step?.expected_type);

    if (!effortCheck.pass && !hasReachedStepAttemptLimit) {
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
        messages: serializeDiscussionMessages(updatedMessages),
        nextStep: serializeDiscussionStep({ key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId }),
        effortRejection: true,
      });
    }

    // ── STEP 1b: Counter-question detection ──
    const counterCheck = detectCounterQuestion(trimmedAnswer);

    if (counterCheck.isCounterQuestion) {
      if (counterCheck.isDeflection && !hasReachedStepAttemptLimit) {
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
          messages: serializeDiscussionMessages(updatedMessages),
          nextStep: serializeDiscussionStep({ key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId }),
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
          messages: serializeDiscussionMessages(updatedMessages),
          nextStep: serializeDiscussionStep({ key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId }),
          clarificationGiven: true,
        });
      }
      // If clarification cap reached, fall through to normal evaluation
    }

    // ── STEP 2: Count prior real attempts for this step ──
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
        expected_type: activeStep?.step?.expected_type ?? 'open',
        evaluation,
        quality_flag: evaluation.qualityFlag ?? 'adequate',
        attempt_number: currentAttemptNumber,
        attempt_limit_reached: hasReachedStepAttemptLimit,
      },
    };

    const coachFeedbackMessagePayload: DiscussionMessagePayload | null = evaluation.coachFeedback
      ? {
          session_id: session.id,
          role: 'agent',
          content: evaluation.coachFeedback,
          step_key: activeStep?.step?.key ? `${activeStep.step.key}-feedback` : 'feedback',
          metadata: {
            type: 'coach_feedback',
            phase: activeStep?.phaseId ?? null,
            evaluator: evaluation.evaluator,
            quality_flag: evaluation.qualityFlag ?? 'adequate',
            assessments: evaluation.assessments ?? [],
          },
        }
      : null;

    // ── STEP 4: Handle LLM-detected low quality ──
    if (
      (evaluation.qualityFlag === 'off_topic' || evaluation.qualityFlag === 'low_effort') &&
      !hasReachedStepAttemptLimit
    ) {
      const batch: DiscussionMessagePayload[] = [studentMessagePayload];
      if (coachFeedbackMessagePayload) batch.push(coachFeedbackMessagePayload);
      const insertedMessages = await insertDiscussionMessagesBatch(batch);
      const insertedStudentMessage = findInsertedStudentMessage(
        insertedMessages,
        activeStep.step.key,
      );
      await insertDiscussionAssessments({
        session,
        promptMessageId: lastAgentMsg?.id ?? null,
        studentMessageId: insertedStudentMessage?.id ?? null,
        step: activeStep.step,
        phase: activeStep.phaseId,
        evaluation,
        learningGoals,
        attemptNumber: currentAttemptNumber,
        scaffoldAction: 'effort_rejection',
        advanceAllowed: false,
        coachFeedback: evaluation.coachFeedback ?? null,
      });

      const updatedMessages = await fetchMessages(session.id);
      return NextResponse.json({
        session: { id: session.id, status: 'in_progress', phase: session.phase, learningGoals },
        messages: serializeDiscussionMessages(updatedMessages),
        nextStep: serializeDiscussionStep({ key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId }),
        effortRejection: true,
      });
    }

    // ── STEP 5: Update goal coverage ──
    learningGoals = applyGoalAssessments(
      learningGoals,
      evaluation,
      activeStep?.step,
      currentAttemptNumber,
    );

    let allGoalsCovered =
      learningGoals.length > 0 && learningGoals.every((goal) => goal.covered === true);

    // ── STEP 6: Retry vs Advance decision ──
    const stepGoalRefs: string[] = Array.isArray(activeStep?.step?.goal_refs)
      ? activeStep.step.goal_refs.filter(Boolean)
      : [];

    if (isRemediationStep && hasReachedStepAttemptLimit) {
      const stillUncoveredTargetGoals = stepGoalRefs.filter(
        (goalId) => !learningGoals.find((goal) => goal.id === goalId)?.covered
      );
      learningGoals = acceptGoalsAfterAttemptLimit(
        learningGoals,
        stillUncoveredTargetGoals,
        'remediation_attempt_limit',
        activeStep?.step,
        currentAttemptNumber,
        'Remediation sudah dicoba dua kali. Siswa dilanjutkan dengan catatan bahwa goal ini masih lemah.',
      );
      allGoalsCovered =
        learningGoals.length > 0 && learningGoals.every((goal) => goal.covered === true);
    }

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
            .order('id', { ascending: false })
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
      const insertedMessages = await insertDiscussionMessagesBatch(retryBatch);
      const insertedStudentMessage = findInsertedStudentMessage(
        insertedMessages,
        activeStep.step.key,
      );
      await insertDiscussionAssessments({
        session,
        promptMessageId: lastAgentMsg?.id ?? null,
        studentMessageId: insertedStudentMessage?.id ?? null,
        step: activeStep.step,
        phase: activeStep.phaseId,
        evaluation,
        learningGoals,
        attemptNumber: currentAttemptNumber,
        remediationRound: isRemediationStep ? countRemediationRounds(messages) : null,
        scaffoldAction: 'retry',
        advanceAllowed: false,
        coachFeedback: evaluation.coachFeedback ?? null,
      });

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
        messages: serializeDiscussionMessages(updatedMessages),
        nextStep: serializeDiscussionStep({ key: activeStep.step.key, prompt: activeStep.step.prompt, expected_type: activeStep.step.expected_type ?? 'open', options: activeStep.step.options ?? [], phase: activeStep.phaseId }),
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
      const insertedMessages = await insertDiscussionMessagesBatch(advanceBatch);
      const insertedStudentMessage = findInsertedStudentMessage(
        insertedMessages,
        activeStep.step.key,
      );
      await insertDiscussionAssessments({
        session,
        promptMessageId: lastAgentMsg?.id ?? null,
        studentMessageId: insertedStudentMessage?.id ?? null,
        step: activeStep.step,
        phase: activeStep.phaseId,
        evaluation,
        learningGoals,
        attemptNumber: currentAttemptNumber,
        scaffoldAction: hasReachedStepAttemptLimit ? 'advance_after_attempt_limit' : 'advance',
        advanceAllowed: true,
        coachFeedback: evaluation.coachFeedback ?? null,
      });

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
        messages: serializeDiscussionMessages(updatedMessages),
        nextStep: serializeDiscussionStep({ key: nextStep.step.key, prompt: nextStep.step.prompt, expected_type: nextStep.step.expected_type ?? 'open', options: nextStep.step.options ?? [], phase: nextStep.phaseId }),
      });
    }

    if (!allGoalsCovered && (!hasMoreTemplateSteps || isRemediationStep)) {
      // ── REMEDIATION: Template steps exhausted but goals remain ──
      const remediationRound = countRemediationRounds(messages) + 1;
      const uncoveredGoals = learningGoals.filter((g) => !g.covered);
      const targetGoal = uncoveredGoals[0];
      const maxRemediationRounds = Math.max(
        MAX_ATTEMPTS_PER_STEP,
        learningGoals.length * MAX_ATTEMPTS_PER_STEP,
      );

      if (remediationRound > maxRemediationRounds && uncoveredGoals.length) {
        learningGoals = acceptGoalsAfterAttemptLimit(
          learningGoals,
          uncoveredGoals.map((goal) => goal.id),
          'remediation_attempt_limit',
          activeStep?.step,
          currentAttemptNumber,
          `Batas remediation global (${maxRemediationRounds} ronde) tercapai. Sesi dilanjutkan dengan catatan bahwa goal ini masih perlu diperkuat.`,
        );
        allGoalsCovered =
          learningGoals.length > 0 && learningGoals.every((goal) => goal.covered === true);
      } else if (targetGoal) {
        const targetGoalIds = [targetGoal.id];

        // Call the second AI endpoint (generateRemediationQuestion) BEFORE any
        // DB writes so a failure here leaves no orphaned rows. The function
        // already has its own try/catch + fallback, but we keep the call
        // outside the batch for belt-and-suspenders atomicity.
        const remediationQuestion = await generateRemediationQuestion(
          targetGoal,
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
            content: `Ada ${uncoveredGoals.length} tujuan pembelajaran yang masih perlu diperkuat. Kita akan membahasnya satu per satu agar lebih mudah.`,
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
            target_goal_ids: targetGoalIds,
            target_goal_id: targetGoal.id,
            target_goal_description: targetGoal.description,
          },
        });

        const insertedMessages = await insertDiscussionMessagesBatch(remediationBatch);
        const insertedStudentMessage = findInsertedStudentMessage(
          insertedMessages,
          activeStep.step.key,
        );
        await insertDiscussionAssessments({
          session,
          promptMessageId: lastAgentMsg?.id ?? null,
          studentMessageId: insertedStudentMessage?.id ?? null,
          step: activeStep.step,
          phase: activeStep.phaseId,
          evaluation,
          learningGoals,
          attemptNumber: currentAttemptNumber,
          remediationRound: isRemediationStep ? countRemediationRounds(messages) : null,
          scaffoldAction: 'remediation_next_goal',
          advanceAllowed: true,
          coachFeedback: evaluation.coachFeedback ?? null,
        });

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
          messages: serializeDiscussionMessages(updatedMessages),
          nextStep: serializeDiscussionStep({ key: remediationStepKey, prompt: remediationQuestion, expected_type: 'open', options: [], phase: 'remediation' }),
          isRemediation: true,
          remediationRound,
          targetGoalId: targetGoal.id,
        });
      }
    }

    // ── SESSION COMPLETION (all goals covered OR max remediation exhausted) ──
    const completionSummary = buildDiscussionCompletionSummary(learningGoals);
    const closingMessage = buildDefaultClosingMessage(learningGoals);

    // Atomic batch: student input + optional coach feedback + closing message.
    const completionBatch: DiscussionMessagePayload[] = [studentMessagePayload];
    if (coachFeedbackMessagePayload) completionBatch.push(coachFeedbackMessagePayload);
    completionBatch.push({
      session_id: session.id,
      role: 'agent',
      content: closingMessage,
      step_key: 'closing',
      metadata: {
        type: 'closing',
        goals: learningGoals,
        completion_reason: completionSummary.completionReason,
        completion_summary: completionSummary,
      },
    });
    const insertedMessages = await insertDiscussionMessagesBatch(completionBatch);
    const insertedStudentMessage = findInsertedStudentMessage(
      insertedMessages,
      activeStep.step.key,
    );
    await insertDiscussionAssessments({
      session,
      promptMessageId: lastAgentMsg?.id ?? null,
      studentMessageId: insertedStudentMessage?.id ?? null,
      step: activeStep.step,
      phase: activeStep.phaseId,
      evaluation,
      learningGoals,
      attemptNumber: currentAttemptNumber,
      remediationRound: isRemediationStep ? countRemediationRounds(messages) : null,
      scaffoldAction: 'complete',
      advanceAllowed: true,
      coachFeedback: evaluation.coachFeedback ?? null,
    });

    const { error: completionUpdateError } = await adminDb
      .from('discussion_sessions')
      .eq('id', session.id)
      .update({
        phase: 'completed',
        status: 'completed',
        learning_goals: learningGoals,
        completed_at: new Date().toISOString(),
        completion_reason: completionSummary.completionReason,
        completion_summary: completionSummary,
      });

    if (completionUpdateError) {
      throw new Error(`Failed to complete discussion session: ${completionUpdateError.message}`);
    }

    await markProgressCompleted(session.user_id, session.course_id, session.subtopic_id);

    const updatedMessages = await fetchMessages(session.id);
    deferCognitiveScoring();

    return NextResponse.json({
      session: { id: session.id, status: 'completed', phase: 'completed', learningGoals },
      messages: serializeDiscussionMessages(updatedMessages),
      nextStep: null,
    });
  } catch (error) {
    console.error('[DiscussionRespond] Failed to process response', error);
    const response = NextResponse.json(
      { error: 'Failed to process discussion response' },
      { status: 500 }
    );
    response.headers.set(
      'x-log-error-message',
      error instanceof Error ? error.message : String(error)
    );
    return response;
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'discussion.respond',
});

async function fetchSession(sessionId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, user_id, status, phase, learning_goals, template_id, subtopic_id, course_id, learning_session_id, data_collection_week')
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
      .select('id, template, version, source, generated_by')
      .eq('id', session.template_id)
      .limit(1);

    if (!error && data?.[0] && isUsableTemplateRow(data[0])) {
      return data[0];
    }
  }

  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, template, version, source, generated_by')
    .eq('subtopic_id', session.subtopic_id)
    .in('generated_by', ['auto', 'auto-module'])
    .order('version', { ascending: false })
    .limit(25);

  if (error) {
    console.error('[DiscussionRespond] Failed to fallback template', error);
    return null;
  }

  return (data ?? []).find(isUsableTemplateRow) ?? null;
}

function isUsableTemplateRow(row: TemplateRecord) {
  const generatedBy = String(row.generated_by ?? '');
  if (generatedBy !== 'auto' && generatedBy !== 'auto-module') {
    return false;
  }

  const status = row.source?.generation?.status;
  return (
    (!status || status === 'ready') &&
    Array.isArray(row.template?.phases) &&
    row.template.phases.length > 0
  );
}

async function fetchMessages(sessionId: string) {
  const { data, error } = await adminDb
    .from('discussion_messages')
    .select('id, role, content, step_key, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

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
    masteryStatus: goal?.masteryStatus ?? goal?.mastery_status,
    assessmentScore:
      typeof goal?.assessmentScore === 'number'
        ? goal.assessmentScore
        : typeof goal?.assessment_score === 'number'
        ? goal.assessment_score
        : null,
    assessmentNotes: goal?.assessmentNotes ?? goal?.assessment_notes ?? null,
    mentorNote: goal?.mentorNote ?? goal?.mentor_note ?? null,
    modelAnswer: goal?.modelAnswer ?? goal?.model_answer ?? null,
    acceptedBy: goal?.acceptedBy ?? goal?.accepted_by ?? null,
    acceptedAt: goal?.acceptedAt ?? goal?.accepted_at ?? null,
    lastAssessedStepKey: goal?.lastAssessedStepKey ?? goal?.last_assessed_step_key ?? null,
    lastAttemptNumber:
      typeof goal?.lastAttemptNumber === 'number'
        ? goal.lastAttemptNumber
        : typeof goal?.last_attempt_number === 'number'
        ? goal.last_attempt_number
        : null,
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
      masteryStatus: existing?.masteryStatus,
      assessmentScore: existing?.assessmentScore ?? null,
      assessmentNotes: existing?.assessmentNotes ?? null,
      mentorNote: existing?.mentorNote ?? null,
      modelAnswer: existing?.modelAnswer ?? null,
      acceptedBy: existing?.acceptedBy ?? null,
      acceptedAt: existing?.acceptedAt ?? null,
      lastAssessedStepKey: existing?.lastAssessedStepKey ?? null,
      lastAttemptNumber: existing?.lastAttemptNumber ?? null,
    };
  });

  const additional = currentGoals.filter(
    (goal) => !merged.some((item) => item.id === goal.id)
  );

  return [...merged, ...additional];
}

function normalizeGoalProximity(value: unknown): GoalProximity {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'met' || normalized === 'sesuai') return 'met';
  if (normalized === 'near' || normalized === 'mendekati') return 'near';
  if (normalized === 'off_topic' || normalized === 'tidak_relevan') return 'off_topic';
  if (normalized === 'unassessable' || normalized === 'tidak_bisa_dinilai') {
    return 'unassessable';
  }
  return 'weak';
}

function clampAssessmentScore(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function acceptanceForProximity(proximity: GoalProximity): {
  accepted: boolean;
  reason: GoalAcceptanceReason;
} {
  if (proximity === 'met') return { accepted: true, reason: 'mastery' };
  if (proximity === 'near') return { accepted: true, reason: 'near_enough' };
  return { accepted: false, reason: 'not_accepted' };
}

function applyGoalAssessments(
  goals: DiscussionGoalState[],
  evaluation: StepEvaluationResult,
  step: DiscussionStep | undefined,
  attemptNumber: number,
): DiscussionGoalState[] {
  const assessmentMap = new Map(
    (evaluation.assessments ?? []).map((assessment) => [assessment.goalId, assessment])
  );
  const now = new Date().toISOString();

  return goals.map((goal) => {
    const assessment = assessmentMap.get(goal.id);
    if (!assessment) return goal;

    return {
      ...goal,
      covered: goal.covered || assessment.accepted,
      masteryStatus: assessment.proximity,
      assessmentScore: assessment.score,
      assessmentNotes: assessment.notes ?? goal.assessmentNotes ?? null,
      mentorNote: assessment.mentorNote ?? goal.mentorNote ?? null,
      modelAnswer: assessment.modelAnswer ?? goal.modelAnswer ?? null,
      acceptedBy: assessment.accepted ? assessment.acceptedReason : goal.acceptedBy ?? null,
      acceptedAt: assessment.accepted ? now : goal.acceptedAt ?? null,
      lastAssessedStepKey: step?.key ?? goal.lastAssessedStepKey ?? null,
      lastAttemptNumber: attemptNumber,
    };
  });
}

function acceptGoalsAfterAttemptLimit(
  goals: DiscussionGoalState[],
  goalIds: string[],
  reason: Exclude<GoalAcceptanceReason, 'mastery' | 'near_enough' | 'not_accepted'>,
  step: DiscussionStep | undefined,
  attemptNumber: number,
  fallbackNote: string,
): DiscussionGoalState[] {
  if (!goalIds.length) return goals;
  const targetIds = new Set(goalIds);
  const now = new Date().toISOString();

  return goals.map((goal) => {
    if (!targetIds.has(goal.id) || goal.covered) return goal;

    return {
      ...goal,
      covered: true,
      masteryStatus: goal.masteryStatus ?? 'weak',
      assessmentScore: goal.assessmentScore ?? 0.35,
      assessmentNotes: goal.assessmentNotes ?? fallbackNote,
      mentorNote:
        goal.mentorNote ??
        'Siswa sudah melewati proses bimbingan, tetapi pemahamannya masih perlu diperkuat.',
      acceptedBy: reason,
      acceptedAt: now,
      lastAssessedStepKey: step?.key ?? goal.lastAssessedStepKey ?? null,
      lastAttemptNumber: attemptNumber,
    };
  });
}

interface GoalAssessment {
  goalId: string;
  satisfied: boolean;
  proximity: GoalProximity;
  score: number;
  notes?: string;
  mentorNote?: string;
  modelAnswer?: string;
  evidence?: string;
  accepted: boolean;
  acceptedReason: GoalAcceptanceReason;
}

interface StepEvaluationResult {
  coveredGoals: string[];
  assessments?: GoalAssessment[];
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
      'Jawabanmu belum tepat. Mari gunakan ini untuk memperjelas konsep sebelum lanjut.';
    const proximity: GoalProximity = isCorrect ? 'met' : 'weak';
    const acceptance = acceptanceForProximity(proximity);
    const modelAnswer =
      typeof step.answer === 'number'
        ? step.options?.[step.answer] ?? String(step.answer)
        : String(step.answer ?? '');

    return {
      coveredGoals,
      assessments: goalRefs.map((goalId) => ({
        goalId,
        satisfied: isCorrect,
        proximity,
        score: isCorrect ? 1 : 0.25,
        notes: isCorrect
          ? 'Pilihan siswa sesuai dengan konsep yang dinilai.'
          : 'Pilihan siswa belum sesuai dengan konsep yang dinilai.',
        mentorNote: feedback,
        modelAnswer,
        accepted: acceptance.accepted,
        acceptedReason: acceptance.reason,
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
                required: ['goalId', 'proximity', 'score', 'notes', 'mentorNote', 'modelAnswer'],
                properties: {
                  goalId: { type: 'string' },
                  proximity: {
                    type: 'string',
                    enum: ['met', 'near', 'weak', 'off_topic', 'unassessable'],
                  },
                  score: { type: 'number' },
                  satisfied: { type: 'boolean' },
                  notes: { type: 'string' },
                  mentorNote: { type: 'string' },
                  modelAnswer: { type: 'string' },
                  evidence: { type: 'string' },
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
              "You are a Socratic learning mentor evaluating how close a learner's response is to each learning goal. Be supportive and research-oriented. Respond only with JSON that matches the required schema.",
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
              "1. Nilailah kedekatan jawaban terhadap setiap goal dengan proximity: met, near, weak, off_topic, atau unassessable.",
              "2. Gunakan score 0.0-1.0. met >= 0.80, near 0.60-0.79, weak 0.25-0.59, off_topic/unassessable < 0.25.",
              "3. satisfied harus true hanya untuk met atau near. Jawaban near boleh dilanjutkan karena siswa sudah mendekati learning goal.",
              "4. notes menjelaskan alasan penilaian secara singkat untuk data penelitian.",
              "5. mentorNote memberi arahan membimbing, bukan menghakimi.",
              "6. modelAnswer berisi contoh jawaban ideal singkat dan mudah dipahami.",
              "7. evidence kutip ringkas bagian jawaban siswa yang menjadi dasar penilaian jika ada.",
              "8. Buat coachFeedback suportif (2-4 kalimat): akui usaha siswa, jelaskan koreksi, lalu beri arahan berikutnya.",
              "9. Tentukan qualityFlag:",
              "   - 'adequate': jawaban menunjukkan usaha nyata dan relevan dengan pertanyaan",
              "   - 'low_effort': jawaban terlalu dangkal, tidak informatif, atau hanya mengulangi pertanyaan",
              "   - 'off_topic': jawaban tidak berkaitan dengan pertanyaan atau materi yang dibahas",
              "   Jika qualityFlag bukan 'adequate', SEMUA goal harus proximity weak/off_topic/unassessable dan satisfied false.",
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

    const goalAssessments: GoalAssessment[] = Array.isArray(parsed.goalAssessments)
      ? parsed.goalAssessments
        .filter((assessment: { goalId?: string }) => goalRefs.includes(assessment?.goalId ?? ''))
        .map((assessment: {
          goalId: string;
          proximity?: string;
          score?: number;
          satisfied?: boolean;
          notes?: string;
          mentorNote?: string;
          modelAnswer?: string;
          evidence?: string;
        }) => {
          const proximity: GoalProximity =
            qualityFlag === 'adequate'
              ? normalizeGoalProximity(assessment.proximity)
              : qualityFlag === 'off_topic'
              ? 'off_topic'
              : 'weak';
          const acceptance = acceptanceForProximity(proximity);
          const fallbackScore =
            proximity === 'met' ? 0.9
            : proximity === 'near' ? 0.68
            : proximity === 'weak' ? 0.4
            : 0.1;
          return {
            goalId: assessment.goalId,
            satisfied: acceptance.accepted,
            proximity,
            score: clampAssessmentScore(assessment.score, fallbackScore),
            notes: assessment.notes,
            mentorNote: assessment.mentorNote,
            modelAnswer: assessment.modelAnswer,
            evidence: assessment.evidence,
            accepted: acceptance.accepted,
            acceptedReason: acceptance.reason,
          };
        })
      : [];

    const coveredGoals = goalAssessments
      .filter((assessment) => assessment.accepted)
      .map((assessment) => assessment.goalId);

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
        proximity: 'unassessable' as GoalProximity,
        score: 0,
        notes: "Evaluation fallback: tidak dapat menilai secara otomatis.",
        mentorNote:
          "Sistem belum berhasil menilai jawaban ini secara otomatis, jadi mentor meminta siswa meninjau ulang poin pentingnya.",
        modelAnswer:
          "Jawaban ideal perlu mengaitkan penjelasan siswa dengan tujuan pembelajaran yang sedang dibahas.",
        accepted: false,
        acceptedReason: 'not_accepted' as GoalAcceptanceReason,
      })),
      coachFeedback:
        "Terima kasih atas jawabanmu. Mari kita ulas kembali poin pentingnya dan pastikan sudah sesuai dengan tujuan.",
      evaluator: "fallback",
    };
  }
}

function buildDiscussionCompletionSummary(goals: DiscussionGoalState[]) {
  const totalGoals = goals.length;
  const metGoals = goals.filter((goal) => goal.masteryStatus === 'met');
  const nearGoals = goals.filter((goal) => goal.masteryStatus === 'near');
  const weakGoals = goals.filter((goal) =>
    goal.covered && goal.masteryStatus !== 'met' && goal.masteryStatus !== 'near'
  );
  const pendingGoals = goals.filter((goal) => !goal.covered);
  const exhaustedGoals = goals.filter((goal) => goal.acceptedBy === 'remediation_attempt_limit');

  const completionReason =
    pendingGoals.length > 0
      ? 'completed_with_pending_notes'
      : exhaustedGoals.length > 0
      ? 'remediation_exhausted'
      : weakGoals.length > 0
      ? 'max_attempts_reached'
      : nearGoals.length > 0
      ? 'near_enough_with_notes'
      : 'all_goals_met';

  return {
    completionReason,
    totalGoals,
    metCount: metGoals.length,
    nearCount: nearGoals.length,
    weakCount: weakGoals.length,
    pendingCount: pendingGoals.length,
    strengths: [...metGoals, ...nearGoals].map((goal) => goal.description),
    needsReview: [...weakGoals, ...pendingGoals].map((goal) => ({
      id: goal.id,
      description: goal.description,
      masteryStatus: goal.masteryStatus ?? 'weak',
      notes: goal.assessmentNotes ?? goal.mentorNote ?? null,
      acceptedBy: goal.acceptedBy ?? null,
    })),
    goals: goals.map((goal) => ({
      id: goal.id,
      description: goal.description,
      covered: goal.covered,
      masteryStatus: goal.masteryStatus ?? null,
      assessmentScore: goal.assessmentScore ?? null,
      assessmentNotes: goal.assessmentNotes ?? null,
      acceptedBy: goal.acceptedBy ?? null,
      lastAttemptNumber: goal.lastAttemptNumber ?? null,
    })),
  };
}

function buildDefaultClosingMessage(goals: DiscussionGoalState[]) {
  const summary = buildDiscussionCompletionSummary(goals);
  const strengths = summary.strengths.map((item) => `- ${item}`).join('\n');
  const needsReview = summary.needsReview
    .map((goal) => `- ${goal.description}${goal.notes ? ` (${goal.notes})` : ''}`)
    .join('\n');

  return [
    'Terima kasih. Kamu sudah menyelesaikan proses diskusi wajib ini.',
    strengths
      ? `Bagian yang sudah kuat atau sudah cukup mendekati:\n${strengths}`
      : '',
    needsReview
      ? `Bagian yang masih perlu diperkuat saat belajar berikutnya:\n${needsReview}`
      : '',
    'Kamu boleh lanjut, sambil membawa catatan perbaikan ini ke topik berikutnya.',
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
