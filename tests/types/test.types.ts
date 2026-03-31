/**
 * Type definitions for test utilities and fixtures
 */

export interface TestUser {
    id: string;
    email: string;
    password: string;
    role: 'user' | 'ADMIN';
    name: string;
}

export interface TestCourse {
    id: string;
    title: string;
    description: string;
    subject: string;
    difficulty_level: string;
    created_by: string;
}

export interface TestSubtopic {
    id: string;
    course_id: string;
    title: string;
    content: {
        explanation: string;
        key_concepts: string[];
        examples?: Array<{
            title: string;
            code?: string;
            description: string;
        }>;
    };
    order_index: number;
}

export interface MockOpenAIResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface APITestContext {
    token: string;
    csrfToken: string;
    userId: string;
    cookies: string;
}

export interface APIResponse<T = unknown> {
    success?: boolean;
    error?: string;
    data?: T;
    user?: TestUser;
    [key: string]: unknown;
}

export interface LoginResponse {
    success: boolean;
    user: {
        id: string;
        email: string;
        role: string;
    };
}

export interface RegisterResponse {
    success: boolean;
    user: {
        id: string;
        email: string;
        name: string;
        role: string;
    };
}

export interface DashboardStats {
    totalUsers?: number;
    totalCourses?: number;
    totalQuestions?: number;
    totalQuizSubmissions?: number;
    stats?: Record<string, number>;
}

export interface QuestionHistoryItem {
    id: string;
    user_id: string;
    course_id: string;
    question: string;
    answer: string;
    created_at: string;
    subtopic?: string;
    context?: string;
}

export interface QuizSubmission {
    id: string;
    user_id: string;
    course_id: string;
    subtopic_id: string;
    answers: Array<{
        questionId: string;
        selectedAnswer: number;
    }>;
    score?: number;
    created_at: string;
}

export interface FeedbackItem {
    id: string;
    user_id: string;
    course_id: string;
    rating: number;
    comment?: string;
    type: string;
    created_at: string;
}

export interface JournalEntry {
    id: string;
    user_id: string;
    course_id: string;
    subtopic_id?: string;
    content: string;
    reflection?: string;
    created_at: string;
}

export interface Discussion {
    id: string;
    user_id: string;
    course_id: string;
    subtopic_id?: string;
    topic: string;
    content: string;
    parent_id?: string;
    created_at: string;
}
