import { openai, defaultOpenAIModel } from '@/lib/openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { z } from 'zod';

export interface ChatCompletionOptions {
  messages: ChatCompletionMessageParam[];
  maxTokens?: number;
  timeoutMs?: number;
}

/** Minimal type for an OpenAI streaming chunk (avoids importing internal SDK types). */
interface StreamChunk {
  choices?: Array<{ delta?: { content?: string | null } }>;
}

/** Default timeout for single AI calls (30 seconds). */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Single OpenAI chat completion with timeout protection.
 * All callers get a 30-second timeout by default to prevent indefinite hangs.
 */
export async function chatCompletion({
  messages,
  maxTokens = 2000,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ChatCompletionOptions) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        messages,
        max_completion_tokens: maxTokens,
      },
      { signal: controller.signal },
    );
  } catch (error: unknown) {
    if (
      (error instanceof Error && error.name === 'AbortError') ||
      controller.signal.aborted
    ) {
      throw new Error(`OpenAI API timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chat completion with retry logic and exponential backoff.
 * Used by generate-course for long-running AI calls.
 */
export async function chatCompletionWithRetry({
  messages,
  maxTokens = 2000,
  timeoutMs = 90000,
  maxAttempts = 3,
}: ChatCompletionOptions & { maxAttempts?: number }) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`[AI] Attempt ${attempt}/${maxAttempts}`);
      return await chatCompletion({ messages, maxTokens, timeoutMs });
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[AI] Attempt ${attempt} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 2000 * attempt)
        );
      }
    }
  }

  throw new Error(
    `OpenAI API failed after ${maxAttempts} attempts: ${lastError?.message}`
  );
}

// ── Streaming ───────────────────────────────────────────────────────────────

/**
 * Start a streaming chat completion with timeout protection.
 * Returns the OpenAI stream and a cleanup function for the timeout timer.
 */
export async function chatCompletionStream(opts: ChatCompletionOptions) {
  const { messages, maxTokens = 2000, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stream = await openai.chat.completions.create(
      {
        model: defaultOpenAIModel,
        messages,
        max_completion_tokens: maxTokens,
        stream: true,
      },
      { signal: controller.signal },
    );
    return { stream, cancelTimeout: () => clearTimeout(timer) };
  } catch (error: unknown) {
    clearTimeout(timer);
    if (
      (error instanceof Error && error.name === 'AbortError') ||
      controller.signal.aborted
    ) {
      throw new Error(`OpenAI API timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Convert an OpenAI stream into a ReadableStream<Uint8Array> for HTTP responses.
 * Calls `onComplete` with the full accumulated text when the stream ends,
 * useful for side-effects like saving to the database.
 */
export function openAIStreamToReadable(
  aiStream: AsyncIterable<StreamChunk>,
  options?: {
    onComplete?: (fullText: string) => void | Promise<void>;
    cancelTimeout?: () => void;
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let fullText = '';

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of aiStream) {
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
        if (options?.onComplete) {
          try {
            await options.onComplete(fullText);
          } catch (err) {
            console.error('[AI Stream] onComplete callback failed:', err);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      } finally {
        options?.cancelTimeout?.();
      }
    },
  });
}

/** Standard headers for a streaming text response. */
export const STREAM_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
} as const;

// ── Prompt injection prevention ─────────────────────────────────────────────

const MAX_INPUT_LENGTH = 10000;

/**
 * Sanitize user input before inserting into AI prompts.
 *
 *  1. Truncate to a safe length (prevents token abuse)
 *  2. Strip common prompt injection patterns
 *  3. Neutralize XML-like tags that could interfere with boundary markers
 *
 * This is a defense-in-depth measure — the system prompt + boundary markers
 * are the primary protection, and sanitization is a secondary filter.
 */
export function sanitizePromptInput(
  input: string,
  maxLength: number = MAX_INPUT_LENGTH
): string {
  let sanitized = input.slice(0, maxLength);

  // Strip attempts to override system instructions
  sanitized = sanitized.replace(
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi,
    '[filtered]'
  );
  sanitized = sanitized.replace(
    /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi,
    '[filtered]'
  );
  sanitized = sanitized.replace(
    /you\s+are\s+now\s+(a|an)\b/gi,
    '[filtered]'
  );
  sanitized = sanitized.replace(
    /new\s+instructions?:/gi,
    '[filtered]'
  );
  sanitized = sanitized.replace(
    /system\s*prompt\s*:/gi,
    '[filtered]'
  );

  // Neutralize XML-like boundary tags that could confuse the delimiter strategy
  sanitized = sanitized.replace(/<\/?user_content>/gi, '');
  sanitized = sanitized.replace(/<\/?system>/gi, '');
  sanitized = sanitized.replace(/<\/?assistant>/gi, '');

  return sanitized.trim();
}

/**
 * Parse JSON from AI response text, stripping markdown code fences.
 * Shared by generate-course, generate-subtopic, generate-examples.
 */
export function parseAIJsonResponse<T = unknown>(raw: string): T {
  if (!raw.trim()) {
    throw new Error('Empty response from model');
  }
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

// ── AI Response Validation ─────────────────────────────────────────────────

/** Validates a single subtopic entry inside a course outline module. */
const AIOutlineSubtopicSchema = z.object({
  title: z.string().min(1),
  overview: z.string().default(''),
});

/** Validates a single module in the AI-generated course outline. */
const AIOutlineModuleSchema = z.object({
  module: z.string().min(1),
  subtopics: z.array(AIOutlineSubtopicSchema).min(1),
});

/** Validates the full course outline array returned by AI. */
export const CourseOutlineResponseSchema = z.array(AIOutlineModuleSchema).min(1).max(10);

/** Validates the examples response returned by AI. */
export const AIExamplesResponseSchema = z.object({
  examples: z.array(z.string()).min(1),
});

/**
 * Parse AI response text and validate against a Zod schema.
 * Throws with a descriptive error if parsing or validation fails.
 */
export function parseAndValidateAIResponse<T>(
  raw: string,
  schema: z.ZodType<T>,
  label = 'AI',
): T {
  const parsed = parseAIJsonResponse(raw);
  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.error(`[${label}] Response validation failed:`, result.error.issues);
    throw new Error(`${label} response does not match expected structure`);
  }
  return result.data;
}
