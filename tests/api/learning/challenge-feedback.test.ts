import { createMockNextRequest } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

const mockAiRateAllowed = jest.fn();
const mockChatCompletion = jest.fn();
const mockParseBody = jest.fn();

jest.mock('@/lib/api-middleware', () => ({
  withProtection: (handler: unknown) => handler,
}));

jest.mock('@/lib/api-logger', () => ({
  withApiLogging: (handler: unknown) => handler,
}));

jest.mock('@/lib/rate-limit', () => ({
  aiRateLimiter: {
    isAllowed: (...args: unknown[]) => mockAiRateAllowed(...args),
  },
}));

jest.mock('@/lib/schemas', () => ({
  ChallengeFeedbackSchema: {},
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

jest.mock('@/services/ai.service', () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
  sanitizePromptInput: (input: string) => input.trim(),
}));

import { POST } from '@/app/api/challenge-feedback/route';

const validBody = {
  question: 'Apa langkah konkret yang Anda ambil?',
  answer: 'Saya akan menenangkan audiens dan menyelaraskan rundown.',
  context: 'Materi membahas koordinasi acara dan komunikasi krisis.',
  level: 'intermediate',
};

function createRequest(body = validBody) {
  return createMockNextRequest('POST', '/api/challenge-feedback', {
    body,
    headers: { 'x-user-id': TEST_STUDENT.id },
  });
}

describe('POST /api/challenge-feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockAiRateAllowed.mockResolvedValue(true);
    mockParseBody.mockImplementation((_schema: unknown, body: typeof validBody) => ({
      success: true,
      data: body,
    }));
    mockChatCompletion.mockResolvedValue({
      choices: [{ message: { content: 'Jawaban sudah jelas dan relevan.' } }],
    });
  });

  it('returns normal AI feedback when the response is usable text', async () => {
    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.feedback).toBe('Jawaban sudah jelas dan relevan.');
  });

  it.each([
    ['empty response', '   '],
    ['empty JSON feedback', '{"feedback":""}'],
    ['malformed JSON feedback', '{"feedback":'],
  ])('returns fallback feedback for %s', async (_label, aiContent) => {
    mockChatCompletion.mockResolvedValueOnce({
      choices: [{ message: { content: aiContent } }],
    });

    const response = await POST(createRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.feedback).toContain('Umpan balik:');
    expect(data.feedback).toContain(validBody.question);
    expect(data.feedback).toContain(validBody.answer);
    expect(data.feedback.trim()).not.toBe('');
    expect(data.feedback).not.toBe(aiContent);
  });
});
