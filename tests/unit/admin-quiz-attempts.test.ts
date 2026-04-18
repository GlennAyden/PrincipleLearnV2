import { describe, expect, it } from '@jest/globals';
import {
  getQuizAttemptCounts,
  getQuizAttemptCountsByUser,
  summarizeQuizAttempts,
} from '@/lib/admin-quiz-attempts';

describe('admin quiz attempt metrics', () => {
  it('counts a multi-question quiz attempt as one attempt', () => {
    const rows = [
      {
        id: 'row-1',
        user_id: 'user-1',
        quiz_attempt_id: 'attempt-1',
        course_id: 'course-1',
        is_correct: true,
        created_at: '2026-04-18T10:00:00.000Z',
      },
      {
        id: 'row-2',
        user_id: 'user-1',
        quiz_attempt_id: 'attempt-1',
        course_id: 'course-1',
        is_correct: false,
        created_at: '2026-04-18T10:00:00.000Z',
      },
    ];

    const attempts = summarizeQuizAttempts(rows, 'user-1');

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      quizAttemptId: 'attempt-1',
      answerRowCount: 2,
      correctAnswerCount: 1,
      score: 50,
      isCorrect: false,
    });
    expect(getQuizAttemptCounts(rows, 'user-1')).toEqual({
      attemptCount: 1,
      answerRowCount: 2,
    });
  });

  it('groups legacy one-row-per-question submissions without a shared attempt id', () => {
    const rows = [
      {
        id: 'legacy-1',
        user_id: 'user-1',
        attempt_number: 2,
        course_id: 'course-1',
        leaf_subtopic_id: 'leaf-1',
        is_correct: true,
        created_at: '2026-04-18T10:00:00.100Z',
      },
      {
        id: 'legacy-2',
        user_id: 'user-1',
        attempt_number: 2,
        course_id: 'course-1',
        leaf_subtopic_id: 'leaf-1',
        is_correct: true,
        created_at: '2026-04-18T10:00:00.900Z',
      },
    ];

    const attempts = summarizeQuizAttempts(rows, 'user-1');

    expect(attempts).toHaveLength(1);
    expect(attempts[0].answerRowCount).toBe(2);
    expect(attempts[0].isCorrect).toBe(true);
  });

  it('counts attempts independently per user', () => {
    const counts = getQuizAttemptCountsByUser([
      { id: 'row-1', user_id: 'user-1', quiz_attempt_id: 'attempt-1' },
      { id: 'row-2', user_id: 'user-1', quiz_attempt_id: 'attempt-1' },
      { id: 'row-3', user_id: 'user-2', quiz_attempt_id: 'attempt-2' },
    ]);

    expect(counts['user-1']).toEqual({ attemptCount: 1, answerRowCount: 2 });
    expect(counts['user-2']).toEqual({ attemptCount: 1, answerRowCount: 1 });
  });
});
