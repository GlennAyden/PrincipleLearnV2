import type { Json } from './database';

export interface LearningGoal {
  id: string;
  description: string;
  covered: boolean;
  rubric?: any;
  thinkingSkill?: any;
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
  metadata?: Record<string, any>;
  stepKey?: string | null;
  createdAt: string;
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
  action: 'mark_completed' | 'export_csv' | 'send_reminder';
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


