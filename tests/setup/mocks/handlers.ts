import { http, HttpResponse } from 'msw';
import { openaiHandlers } from './openai.mock';

// Base URL for API requests
const API_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://test.supabase.co';

// Mock Supabase database responses
const supabaseHandlers = [
    // Mock Supabase REST API - Select users
    http.get(`${API_BASE}/rest/v1/users`, ({ request }) => {
        const url = new URL(request.url);
        const email = url.searchParams.get('email');

        if (email === 'eq.test@example.com') {
            return HttpResponse.json([
                {
                    id: 'test-user-id',
                    email: 'test@example.com',
                    password_hash: '$2b$10$testhashedpassword',
                    role: 'user',
                    name: 'Test User',
                    created_at: new Date().toISOString(),
                },
            ]);
        }

        if (email === 'eq.admin@example.com') {
            return HttpResponse.json([
                {
                    id: 'test-admin-id',
                    email: 'admin@example.com',
                    password_hash: '$2b$10$testhashedpassword',
                    role: 'ADMIN',
                    name: 'Test Admin',
                    created_at: new Date().toISOString(),
                },
            ]);
        }

        return HttpResponse.json([]);
    }),

    // Mock Supabase REST API - Insert users
    http.post(`${API_BASE}/rest/v1/users`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json([
            {
                id: 'new-user-id-' + Date.now(),
                ...body,
                created_at: new Date().toISOString(),
            },
        ], { status: 201 });
    }),

    // Mock Supabase REST API - Select courses
    http.get(`${API_BASE}/rest/v1/courses`, ({ request }) => {
        const url = new URL(request.url);
        const userId = url.searchParams.get('created_by');

        return HttpResponse.json([
            {
                id: 'test-course-id',
                title: 'Test Course',
                description: 'A test course for learning',
                subject: 'Testing',
                difficulty_level: 'beginner',
                created_by: userId?.replace('eq.', '') || 'test-user-id',
                created_at: new Date().toISOString(),
            },
        ]);
    }),

    // Mock Supabase REST API - Quiz submissions
    http.get(`${API_BASE}/rest/v1/quiz_submissions`, () => {
        return HttpResponse.json([]);
    }),

    http.post(`${API_BASE}/rest/v1/quiz_submissions`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json([
            {
                id: 'submission-' + Date.now(),
                ...body,
                created_at: new Date().toISOString(),
            },
        ], { status: 201 });
    }),

    // Mock Supabase REST API - Journals
    http.get(`${API_BASE}/rest/v1/journals`, () => {
        return HttpResponse.json([]);
    }),

    http.post(`${API_BASE}/rest/v1/journals`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json([
            {
                id: 'journal-' + Date.now(),
                ...body,
                created_at: new Date().toISOString(),
            },
        ], { status: 201 });
    }),

    // Mock Supabase REST API - Feedback
    http.get(`${API_BASE}/rest/v1/feedback`, () => {
        return HttpResponse.json([]);
    }),

    http.post(`${API_BASE}/rest/v1/feedback`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json([
            {
                id: 'feedback-' + Date.now(),
                ...body,
                created_at: new Date().toISOString(),
            },
        ], { status: 201 });
    }),

    // Mock Supabase REST API - Discussion
    http.get(`${API_BASE}/rest/v1/discussions`, () => {
        return HttpResponse.json([]);
    }),

    http.post(`${API_BASE}/rest/v1/discussions`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json([
            {
                id: 'discussion-' + Date.now(),
                ...body,
                created_at: new Date().toISOString(),
            },
        ], { status: 201 });
    }),

    // Mock Supabase REST API - Admin activity endpoints
    http.get(`${API_BASE}/rest/v1/ask_question_history`, () => {
        return HttpResponse.json([
            {
                id: 'history-1',
                user_id: 'test-user-id',
                course_id: 'test-course-id',
                question: 'What is testing?',
                answer: 'Testing is the process of...',
                created_at: new Date().toISOString(),
            },
        ]);
    }),

    // Generic handler for other Supabase tables
    http.all(`${API_BASE}/rest/v1/*`, () => {
        return HttpResponse.json([]);
    }),
];

// Combine all handlers
export const handlers = [
    ...openaiHandlers,
    ...supabaseHandlers,
];
