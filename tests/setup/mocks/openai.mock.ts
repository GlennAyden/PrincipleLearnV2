import { http, HttpResponse } from 'msw';

// OpenAI API base URL
const OPENAI_API_BASE = 'https://api.openai.com/v1';

/**
 * Mock responses for different OpenAI use cases
 */
export const mockResponses = {
    // Mock response for course generation
    courseGeneration: {
        id: 'chatcmpl-mock-course',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: JSON.stringify({
                        title: 'Test Generated Course',
                        description: 'A comprehensive course on testing',
                        modules: [
                            {
                                title: 'Introduction to Testing',
                                subtopics: [
                                    {
                                        title: 'What is Testing?',
                                        content: {
                                            explanation: 'Testing is the process of evaluating a system...',
                                            key_concepts: ['unit testing', 'integration testing', 'e2e testing'],
                                            examples: ['Example 1', 'Example 2'],
                                        },
                                    },
                                    {
                                        title: 'Types of Testing',
                                        content: {
                                            explanation: 'There are several types of testing...',
                                            key_concepts: ['manual testing', 'automated testing'],
                                            examples: ['Example A', 'Example B'],
                                        },
                                    },
                                ],
                            },
                        ],
                    }),
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 100,
            completion_tokens: 500,
            total_tokens: 600,
        },
    },

    // Mock response for ask-question
    askQuestion: {
        id: 'chatcmpl-mock-question',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: 'This is a mock answer to your question about testing concepts.',
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 50,
            completion_tokens: 100,
            total_tokens: 150,
        },
    },

    // Mock response for challenge thinking
    challengeThinking: {
        id: 'chatcmpl-mock-challenge',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: JSON.stringify({
                        challenge: 'Think about how you would test this scenario...',
                        hints: ['Consider edge cases', 'Think about error handling'],
                    }),
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 30,
            completion_tokens: 80,
            total_tokens: 110,
        },
    },
};

/**
 * MSW handlers for OpenAI API
 */
export const openaiHandlers = [
    // Chat completions endpoint
    http.post(`${OPENAI_API_BASE}/chat/completions`, async ({ request }) => {
        const body = await request.json() as { messages?: Array<{ content: string }> };

        // Determine which mock response to return based on the prompt
        let mockResponse = { ...mockResponses.askQuestion };

        const messagesContent = body.messages?.map(m => m.content).join(' ') || '';

        if (messagesContent.includes('generate') || messagesContent.includes('course')) {
            mockResponse = { ...mockResponses.courseGeneration };
        } else if (messagesContent.includes('challenge') || messagesContent.includes('think')) {
            mockResponse = { ...mockResponses.challengeThinking };
        }

        // Update timestamp
        mockResponse.created = Math.floor(Date.now() / 1000);

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 100));

        return HttpResponse.json(mockResponse);
    }),

    // Models endpoint (for listing available models)
    http.get(`${OPENAI_API_BASE}/models`, () => {
        return HttpResponse.json({
            object: 'list',
            data: [
                { id: 'gpt-4', object: 'model', owned_by: 'openai' },
                { id: 'gpt-4-turbo', object: 'model', owned_by: 'openai' },
                { id: 'gpt-3.5-turbo', object: 'model', owned_by: 'openai' },
            ],
        });
    }),

    // Embeddings endpoint (if needed)
    http.post(`${OPENAI_API_BASE}/embeddings`, async ({ request }) => {
        const body = await request.json() as { input?: string | string[] };
        const input = body.input || '';
        const inputs = Array.isArray(input) ? input : [input];

        return HttpResponse.json({
            object: 'list',
            data: inputs.map((_, index) => ({
                object: 'embedding',
                index,
                embedding: Array(1536).fill(0).map(() => Math.random() * 2 - 1),
            })),
            model: 'text-embedding-ada-002',
            usage: {
                prompt_tokens: 10,
                total_tokens: 10,
            },
        });
    }),
];

/**
 * Helper function to create a custom mock response for specific tests
 */
export function createMockResponse(content: string, model: string = 'gpt-4') {
    return {
        id: `chatcmpl-mock-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content,
                },
                finish_reason: 'stop',
            },
        ],
        usage: {
            prompt_tokens: 50,
            completion_tokens: content.length / 4,
            total_tokens: 50 + content.length / 4,
        },
    };
}

/**
 * Helper to create error response
 */
export function createErrorResponse(message: string, type: string = 'invalid_request_error') {
    return {
        error: {
            message,
            type,
            param: null,
            code: null,
        },
    };
}
