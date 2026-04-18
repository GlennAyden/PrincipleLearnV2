/**
 * Student Management Types
 * Admin Student page — /admin/users
 */

// ============================================
// STUDENT LIST (GET /api/admin/users)
// ============================================

/** Row in the student list table */
export interface StudentListItem {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  totalCourses: number;
  totalTranscripts: number;
  totalQuizzes: number;
  totalJournals: number;
  totalReflections?: number;
  totalChallenges: number;
  totalAskQuestions: number;
  totalDiscussions: number;
  totalFeedbacks: number;
  /** Dominant prompt stage: SCP | SRP | MQP | REFLECTIVE | N/A */
  promptStage: string;
  /** Composite engagement score 0–100 */
  engagementScore: number;
  /** ISO date string of last activity, or null when the user has not generated activity yet */
  lastActivity: string | null;
  /** 0–100 percentage of completed subtopics across all courses */
  courseCompletionRate: number;
}

// ============================================
// STUDENT DETAIL (GET /api/admin/users/[id]/detail)
// ============================================

export interface StudentDetail extends StudentListItem {
  learningProfile: StudentLearningProfile | null;
  courses: StudentCourse[];
  recentReflection?: StudentReflectionEntry | null;
  recentActivity: StudentActivityEntry[];
  activityTimeline: ActivityTimelineEntry[];
}

export interface StudentReflectionEntry {
  id: string;
  title?: string;
  snippet?: string | null;
  rating?: number | null;
  createdAt: string;
  source: 'jurnal' | 'feedback';
}

export interface StudentLearningProfile {
  displayName: string;
  programmingExperience: string;
  learningStyle: string;
  learningGoals: string;
  challenges: string;
}

export interface StudentCourse {
  id: string;
  title: string;
  createdAt: string;
  subtopicCount: number;
  completedSubtopics: number;
  quizCount: number;
  quizCorrect: number;
}

export interface StudentActivityEntry {
  id: string;
  type: ActivityType;
  title: string;
  detail: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export type ActivityType =
  | 'course'
  | 'ask'
  | 'challenge'
  | 'quiz'
  | 'journal'
  | 'reflection'
  | 'transcript'
  | 'feedback'
  | 'discussion';

export interface ActivityTimelineEntry {
  /** ISO date YYYY-MM-DD */
  date: string;
  counts: Partial<Record<ActivityType, number>>;
}

// ============================================
// ACTIVITY SUMMARY (GET /api/admin/users/[id]/activity-summary)
// ============================================

export interface ActivitySummary {
  userId: string;
  email: string;
  recentDiscussion: {
    sessionId: string;
    status: string;
    phase: string | null;
    updatedAt: string;
    goalCount: number;
  } | null;
  recentJournal: {
    id: string;
    title?: string;
    snippet?: string | null;
    createdAt: string;
  } | null;
  recentReflection: {
    id: string;
    title?: string;
    snippet?: string | null;
    rating?: number | null;
    createdAt: string;
    source: 'jurnal' | 'feedback';
  } | null;
  recentTranscript: {
    id: string;
    title?: string;
    createdAt: string;
  } | null;
  recentAskQuestion: {
    id: string;
    question: string;
    createdAt: string;
  } | null;
  recentChallenge: {
    id: string;
    challengeType?: string;
    createdAt: string;
  } | null;
  recentQuiz: {
    id: string;
    isCorrect: boolean;
    createdAt: string;
  } | null;
  recentFeedback: {
    id: string;
    rating?: number;
    createdAt: string;
  } | null;
  totals: {
    discussions: number;
    reflections: number;
    journals: number;
    transcripts: number;
    askQuestions: number;
    challenges: number;
    quizzes: number;
    feedbacks: number;
    courses: number;
  };
}

// ============================================
// EXPORT (GET /api/admin/users/export)
// ============================================

export interface StudentExportOptions {
  format: 'csv' | 'json';
  userIds?: string[];
  includeActivity: boolean;
  includeCourses: boolean;
  dateRange?: { start: string; end: string };
}

export interface StudentExportResult {
  format: string;
  recordCount: number;
  data: string; // CSV string or JSON string
  filename: string;
}
