type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface LearningGoal {
  id: string;
  description: string;
  covered: boolean;
  rubric?: Record<string, unknown>;
  thinkingSkill?: Record<string, unknown>;
}

export interface DiscussionSession {
  id: string;
  status: 'in_progress' | 'completed' | 'failed';
  phase: string;
  learningGoals: LearningGoal[];
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string | null;
  };
  course: {
    id: string;
    title: string | null;
  };
  subtopic: {
    id: string;
    title: string | null;
  };
}

export type DiscussionSessionListItem = DiscussionSession;

export interface DiscussionMessage {
  id: string;
  role: 'agent' | 'student';
  content: string;
  metadata?: Record<string, unknown>;
  stepKey?: string | null;
  createdAt: string;
}

export interface DiscussionStep {
  key: string;
  prompt: string;
  expectedType?: string;
  options?: string[];
  phase?: string;
}

export interface AdminAction {
  id: string;
  action: string;
  payload: Json | null;
  createdAt: string;
  adminId: string | null;
  adminEmail: string | null;
}

export interface SessionDetail {
  session: DiscussionSession;
  messages: DiscussionMessage[];
  adminActions: AdminAction[];
}

export interface ModulePrerequisiteSummary {
  expectedSubtopics: number;
  generatedSubtopics: number;
  totalQuizQuestions: number;
  answeredQuizQuestions: number;
  minQuestionsPerSubtopic: number;
}

export interface ModulePrerequisiteItem {
  key: string;
  title: string;
  generated: boolean;
  quizQuestionCount: number;
  answeredCount: number;
  quizCompleted: boolean;
  missingQuestions: string[];
  userHasCompletion?: boolean;
  completedUsers?: string[];
}

export interface ModulePrerequisiteDetails {
  ready: boolean;
  summary: ModulePrerequisiteSummary;
  subtopics: ModulePrerequisiteItem[];
}

export interface SearchFilters {
  status?: string;
  search?: string;
  courseId?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  phase?: string;
}

export interface DiscussionAnalytics {
  totalSessions: number;
  inProgress: number;
  completed: number;
  stalled: number; // >48h no activity
  avgTurns: number;
  completionRate: number;
  avgGoalCoverage: number;
}

export interface SessionHealthScore {
  score: number; // 0-100
  color: 'red' | 'yellow' | 'green';
  reasons: string[];
}

export interface BulkActionRequest {
  sessionIds: string[];
  action: 'export_csv';
}

export interface DiscussionSessionListItemWithHealth extends DiscussionSessionListItem {
  healthScore?: SessionHealthScore;
  messageCount?: number; // approx turns
}

export type DiscussionApiResponse = {
  sessions: DiscussionSessionListItemWithHealth[];
  nextCursor?: string;
  analytics?: DiscussionAnalytics;
};

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const result = asString(value).trim();
    if (result) return result;
  }
  return '';
}

function asBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return Boolean(value);
}

function asDateString(...values: unknown[]): string {
  for (const value of values) {
    const result = asString(value).trim();
    if (result) return result;
  }
  return '';
}

function normalizeGoalsArray(value: unknown): LearningGoal[] {
  if (!Array.isArray(value)) return [];

  return value.map((goal, index) => {
    const raw = isRecord(goal) ? goal : {};
    const rubric = isRecord(raw.rubric)
      ? raw.rubric
      : isRecord(raw.goal_rubric)
      ? raw.goal_rubric
      : undefined;
    const thinkingSkill = isRecord(raw.thinkingSkill)
      ? raw.thinkingSkill
      : isRecord(raw.thinking_skill)
      ? raw.thinking_skill
      : undefined;

    return {
      id: pickString(raw.id, raw.goalId, raw.goal_id) || `goal-${index + 1}`,
      description: pickString(
        raw.description,
        raw.title,
        raw.text,
        raw.goal,
        raw.prompt,
        raw.message
      ) || `Tujuan ${index + 1}`,
      covered: asBoolean(raw.covered ?? raw.isCovered ?? raw.completed ?? raw.done),
      rubric,
      thinkingSkill,
    };
  });
}

function normalizeSessionStatus(value: unknown): DiscussionSession['status'] {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed') return 'failed';
  return 'in_progress';
}

export function normalizeDiscussionSession(value: unknown): DiscussionSession {
  const raw = isRecord(value) ? value : {};
  const user = isRecord(raw.user) ? raw.user : {};
  const course = isRecord(raw.course) ? raw.course : {};
  const subtopic = isRecord(raw.subtopic) ? raw.subtopic : {};

  return {
    id: pickString(raw.id),
    status: normalizeSessionStatus(raw.status),
    phase: pickString(raw.phase),
    learningGoals: normalizeGoalsArray(raw.learningGoals ?? raw.learning_goals),
    createdAt: asDateString(raw.createdAt, raw.created_at),
    updatedAt: asDateString(raw.updatedAt, raw.updated_at, raw.createdAt, raw.created_at),
    user: {
      id: pickString(user.id, raw.user_id),
      email: pickString(user.email, raw.user_email) || null,
    },
    course: {
      id: pickString(course.id, raw.course_id),
      title: pickString(course.title, raw.course_title) || null,
    },
    subtopic: {
      id: pickString(subtopic.id, raw.subtopic_id),
      title: pickString(subtopic.title, raw.subtopic_title) || null,
    },
  };
}

export function normalizeDiscussionSessions(value: unknown): DiscussionSession[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeDiscussionSession(item));
}

export function normalizeDiscussionMessage(value: unknown): DiscussionMessage {
  const raw = isRecord(value) ? value : {};
  const metadata = isRecord(raw.metadata) ? raw.metadata : undefined;

  return {
    id: pickString(raw.id),
    role: asString(raw.role).toLowerCase() === 'student' ? 'student' : 'agent',
    content: pickString(raw.content),
    metadata,
    stepKey: pickString(raw.stepKey, raw.step_key) || null,
    createdAt: asDateString(raw.createdAt, raw.created_at, raw.timestamp),
  };
}

export function normalizeDiscussionMessages(value: unknown): DiscussionMessage[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeDiscussionMessage(item));
}

export function normalizeDiscussionStep(value: unknown): DiscussionStep | null {
  const raw = isRecord(value) ? value : {};
  const key = pickString(raw.key, raw.stepKey, raw.step_key);
  const prompt = pickString(raw.prompt, raw.question, raw.content);
  if (!key && !prompt) return null;

  const options = Array.isArray(raw.options)
    ? raw.options.map((option) => asString(option)).filter(Boolean)
    : undefined;

  return {
    key: key || prompt || 'step',
    prompt,
    expectedType: pickString(raw.expectedType, raw.expected_type) || undefined,
    options,
    phase: pickString(raw.phase) || undefined,
  };
}

export function normalizeAdminAction(value: unknown): AdminAction {
  const raw = isRecord(value) ? value : {};
  const payload = raw.payload ?? raw.data ?? null;

  return {
    id: pickString(raw.id),
    action: pickString(raw.action),
    payload: (payload as Json) ?? null,
    createdAt: asDateString(raw.createdAt, raw.created_at),
    adminId: pickString(raw.adminId, raw.admin_id) || null,
    adminEmail: pickString(raw.adminEmail, raw.admin_email) || null,
  };
}

export function normalizeAdminActions(value: unknown): AdminAction[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeAdminAction(item));
}

export function normalizeDiscussionResponse(value: unknown) {
  const raw = isRecord(value) ? value : {};
  const rawData = isRecord(raw.data) ? raw.data : {};

  return {
    session: normalizeDiscussionSession(raw.session ?? rawData.session ?? raw),
    messages: normalizeDiscussionMessages(raw.messages ?? rawData.messages),
    currentStep: normalizeDiscussionStep(raw.currentStep ?? raw.current_step),
    nextStep: normalizeDiscussionStep(raw.nextStep ?? raw.next_step),
  };
}


