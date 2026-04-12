// src/lib/engagement.ts
// Shared engagement score calculation — used by both the student list view
// (/api/admin/users) and the student detail view (/api/admin/users/[id]/detail)
// so the same student always shows the same engagement score.

export interface EngagementInput {
  courses: number;
  quizzes: number;
  journals: number;
  transcripts: number;
  askQuestions: number;
  challenges: number;
  discussions: number;
  feedbacks: number;
}

// Weighted composite of all learning activities. Weights reflect
// the relative cognitive/engagement cost of each activity type:
// - courses enrolled (3): shows commitment but low per-unit work
// - challenges / discussions (3): highest per-unit cognitive engagement
// - quizzes / journals / ask-questions (2): moderate engagement
// - transcripts / feedbacks (1): lightweight engagement
// Normalized to 0–100 by dividing by 50 and capping.
export function computeEngagementScore(input: EngagementInput): number {
  const totalInteractions =
    input.courses * 3 +
    input.quizzes * 2 +
    input.journals * 2 +
    input.transcripts * 1 +
    input.askQuestions * 2 +
    input.challenges * 3 +
    input.discussions * 3 +
    input.feedbacks * 1;

  return Math.min(100, Math.round((totalInteractions / 50) * 100));
}
