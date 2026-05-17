// src/app/api/generate-outline/route.ts
//
// Fast outline-only generation — returns JSON structure without persisting to DB.
// Used by the A2 preview flow: step3 → /api/generate-outline → /request-course/preview.
//
// Response shape:
//   { outline: Array<{ module: string; subtopics: Array<{ title: string; summary: string }> }> }

import { NextRequest, NextResponse } from 'next/server';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { aiRateLimiter } from '@/lib/rate-limit';
import { GenerateCourseSchema, parseBody } from '@/lib/schemas';
import { chatCompletionWithRetry, sanitizePromptInput } from '@/services/ai.service';
import { resolveAuthContext } from '@/lib/auth-helper';

export interface OutlineSubtopic {
  title: string;
  summary: string;
}

export interface OutlineModule {
  module: string;
  subtopics: OutlineSubtopic[];
}

async function postHandler(req: NextRequest) {
  console.log('[Generate Outline] Starting outline-only generation');

  let requestBody: unknown;
  try {
    requestBody = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON tidak valid dalam body permintaan' }, { status: 400 });
  }

  const parsed = parseBody(GenerateCourseSchema, requestBody);
  if (!parsed.success) return parsed.response;
  const { topic, goal, level, extraTopics, problem, assumption } = parsed.data;

  const authContext = resolveAuthContext(req);
  const rateLimitKey =
    authContext?.userId ??
    authContext?.email ??
    req.headers.get('x-forwarded-for') ??
    'unknown';

  if (!(await aiRateLimiter.isAllowed(rateLimitKey))) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
      { status: 429 },
    );
  }

  const safeTopic = sanitizePromptInput(topic, 500);
  const safeGoal = sanitizePromptInput(goal, 1000);
  const safeExtra = sanitizePromptInput(extraTopics || '', 500);
  const safeProblem = sanitizePromptInput(problem || '', 500);
  const safeAssumption = sanitizePromptInput(assumption || '', 500);

  // Accept optional temperature override (for "Ganti Outline" with more variety).
  // We read it from a custom header so GenerateCourseSchema stays .strict().
  const wantsVariation = req.headers.get('x-outline-variation') === '1';

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: `You are an expert educational content developer. Your task is to produce a concise course outline.
Language policy:
- Write all outputs in the same language as the user's inputs (detect from topic/goal/extraTopics).
- If inputs are mixed, choose the dominant language; preserve technical terms.
IMPORTANT: Output only a JSON array — no markdown fences, no explanation.`,
  };

  const userMessage: ChatCompletionMessageParam = {
    role: 'user',
    content: `<user_content>
Create a course outline for topic "${safeTopic}", goal "${safeGoal}".
Level: ${level}
Extra topics: ${safeExtra || 'None'}
Real-world problem: ${safeProblem || 'None'}
Initial assumption: ${safeAssumption || 'None'}
</user_content>

OUTPUT FORMAT — return a PURE JSON array (no markdown fences):
[
  {
    "module": "1. Module Title",
    "subtopics": [
      { "title": "1.1 Subtopic Title", "summary": "One-sentence description of what is covered." }
    ]
  }
]

Rules:
- 4-6 modules.
- 3-5 subtopics per module.
- Each summary: 1-2 sentences maximum.
- Write in the same language as the user inputs.${wantsVariation ? '\n- Use a fresh angle; vary the module breakdown compared to a typical treatment of this topic.' : ''}`,
  };

  let response;
  try {
    response = await chatCompletionWithRetry({
      messages: [systemMessage, userMessage],
      maxTokens: 3000,
      timeoutMs: 45000,
      maxAttempts: 2,
    });
  } catch (err) {
    console.error('[Generate Outline] OpenAI error:', err);
    return NextResponse.json(
      { error: 'Gagal memanggil layanan AI. Coba lagi sebentar.', code: 'AI_ERROR' },
      { status: 502 },
    );
  }

  const raw = response.choices?.[0]?.message?.content?.trim() ?? '';
  if (!raw) {
    return NextResponse.json(
      { error: 'Respons AI kosong.', code: 'AI_EMPTY' },
      { status: 502 },
    );
  }

  // Strip markdown fences if model ignores the instruction
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  let outline: OutlineModule[];
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) throw new Error('Not an array');
    // Normalise shape: ensure every subtopic has title + summary
    outline = (parsed as unknown[]).map((mod, mi) => {
      const m = mod as Record<string, unknown>;
      const subs = Array.isArray(m.subtopics) ? m.subtopics : [];
      return {
        module: typeof m.module === 'string' ? m.module : `Module ${mi + 1}`,
        subtopics: (subs as unknown[]).map((s, si) => {
          const sub = s as Record<string, unknown>;
          return {
            title: typeof sub.title === 'string' ? sub.title : `Subtopic ${si + 1}`,
            summary: typeof sub.summary === 'string'
              ? sub.summary
              : typeof sub.overview === 'string'
              ? sub.overview
              : '',
          };
        }),
      };
    });
  } catch (parseErr) {
    console.error('[Generate Outline] JSON parse failed:', parseErr, '\nRaw:', cleaned.slice(0, 500));
    return NextResponse.json(
      { error: 'Respons AI tidak valid.', code: 'AI_PARSE_ERROR' },
      { status: 502 },
    );
  }

  console.log(`[Generate Outline] Returning ${outline.length} modules`);
  return NextResponse.json({ outline });
}

export const POST = withApiLogging(withProtection(postHandler), {
  label: 'generate-outline',
});
