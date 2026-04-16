export interface StoredQuizItem {
  question?: unknown;
  options?: unknown;
  correctIndex?: unknown;
}

export interface ClientQuizItem {
  question: string;
  options: string[];
}

type CacheRecord = Record<string, unknown>;

const COMPLETION_METADATA_KEYS = [
  'completed_users',
  'last_completed_at',
  'last_quiz_attempt_id',
  'last_quiz_completed_at',
] as const;

function asRecord(value: unknown): CacheRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as CacheRecord;
  }
  return {};
}

function normalizeQuestion(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((option) => (typeof option === 'string' ? option.trim() : ''))
    .filter(Boolean);
}

export function sanitizeQuizForClient(value: unknown): ClientQuizItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const record = asRecord(item);
      const question = normalizeQuestion(record.question);
      const options = normalizeOptions(record.options);

      if (!question || options.length === 0) {
        return null;
      }

      return {
        question,
        options,
      };
    })
    .filter((item): item is ClientQuizItem => item !== null);
}

export function sanitizeSubtopicContentForClient<T extends CacheRecord>(content: T): T {
  return {
    ...content,
    quiz: sanitizeQuizForClient(content.quiz),
  };
}

export function mergeSubtopicCacheContent(
  existingContent: unknown,
  nextContent: CacheRecord,
): CacheRecord {
  const existing = asRecord(existingContent);
  const merged: CacheRecord = {
    ...existing,
    ...nextContent,
  };

  for (const key of COMPLETION_METADATA_KEYS) {
    if (!(key in nextContent) && key in existing) {
      merged[key] = existing[key];
    }
  }

  if (Array.isArray(existing.completed_users) && !Array.isArray(nextContent.completed_users)) {
    merged.completed_users = [...new Set(existing.completed_users.map((value) => String(value)))];
  }

  return merged;
}

export function withQuizCompletionState(
  content: unknown,
  userId: string,
  attemptId?: string,
  completedAt: string = new Date().toISOString(),
): CacheRecord {
  const existing = asRecord(content);
  const existingUsers = Array.isArray(existing.completed_users)
    ? existing.completed_users.map((value) => String(value))
    : [];
  const completedUsers = existingUsers.includes(userId)
    ? existingUsers
    : [...existingUsers, userId];

  return {
    ...existing,
    completed_users: completedUsers,
    last_completed_at: completedAt,
    ...(attemptId ? { last_quiz_attempt_id: attemptId } : {}),
    last_quiz_completed_at: completedAt,
  };
}
