type DiscussionMessageRecord = {
  id: string;
  role: string;
  content: string;
  step_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DiscussionAdminActionRecord = {
  id: string;
  action: string;
  payload: unknown;
  created_at: string;
  admin_id: string | null;
  admin_email: string | null;
};

type DiscussionStepDto = {
  key: string;
  prompt: string;
  expected_type?: string;
  expectedType?: string;
  options?: string[];
  phase?: string;
};

export interface DiscussionHealthScore {
  score: number;
  color: 'red' | 'yellow' | 'green';
  reasons: string[];
}

export function serializeDiscussionMessage(message: DiscussionMessageRecord) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    metadata: message.metadata ?? null,
    stepKey: message.step_key,
    createdAt: message.created_at,
    // Transitional aliases for existing callers still expecting DB casing.
    step_key: message.step_key,
    created_at: message.created_at,
  };
}

export function serializeDiscussionMessages(messages: DiscussionMessageRecord[]) {
  return messages.map(serializeDiscussionMessage);
}

export function serializeDiscussionAdminAction(action: DiscussionAdminActionRecord) {
  return {
    id: action.id,
    action: action.action,
    payload: action.payload,
    createdAt: action.created_at,
    adminId: action.admin_id,
    adminEmail: action.admin_email,
  };
}

export function serializeDiscussionAdminActions(actions: DiscussionAdminActionRecord[]) {
  return actions.map(serializeDiscussionAdminAction);
}

export function serializeDiscussionStep(step: DiscussionStepDto | null) {
  if (!step) return null;

  const expectedType = step.expectedType ?? step.expected_type ?? 'open';

  return {
    key: step.key,
    prompt: step.prompt,
    options: step.options ?? [],
    phase: step.phase ?? 'phase',
    expectedType,
    // Transitional alias for existing callers still expecting snake_case.
    expected_type: expectedType,
  };
}

export function resolveDiscussionRelatedCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object' && 'count' in value) {
    const count = Number((value as { count?: unknown }).count);
    return Number.isFinite(count) ? count : 0;
  }
  const count = Number(value);
  return Number.isFinite(count) ? count : 0;
}

export function buildDiscussionHealthScore(params: {
  goals: Array<{ covered?: boolean }>;
  messageCount: number;
  updatedAt: string;
  now?: Date;
}): DiscussionHealthScore {
  const now = params.now ?? new Date();
  const goals = Array.isArray(params.goals) ? params.goals : [];
  const goalPct = goals.length
    ? goals.filter((goal) => goal.covered).length / goals.length
    : 0;
  const hasActivity = params.messageCount > 3;
  const daysStalled =
    (now.getTime() - new Date(params.updatedAt).getTime()) /
    (24 * 60 * 60 * 1000);
  const score = Math.round(
    goalPct * 50 +
      (hasActivity ? 30 : 0) +
      (daysStalled < 2 ? 20 : 0)
  );
  const color = score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';
  const reasons: string[] = [];

  if (goalPct < 0.5) reasons.push('Low goal coverage');
  if (!hasActivity) reasons.push('Low activity');
  if (daysStalled > 2) reasons.push('Stalled');

  return { score, color, reasons };
}
