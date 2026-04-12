// src/app/api/quiz/regenerate/route.ts
// POST /api/quiz/regenerate
// Generates 5 new quiz questions for a subtopic (for the Reshuffle feature).
// Old quiz rows are preserved for audit/admin display via appendNewQuizQuestions.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { aiRateLimiter } from '@/lib/rate-limit';
import { chatCompletion } from '@/services/ai.service';
import { appendNewQuizQuestions } from '@/lib/quiz-sync';
import { parseBody } from '@/lib/schemas';
import { verifyToken } from '@/lib/jwt';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

const QuizRegenerateSchema = z.object({
  courseId: z.string().min(1),
  moduleTitle: z.string().min(1),
  subtopicTitle: z.string().min(1),
});

interface QuizOutputItem {
  question: string;
  options: string[];
  correctIndex: number;
}

async function postHandler(req: NextRequest) {
  // Prefer middleware-injected header; fall back to JWT cookie directly.
  let userId = req.headers.get('x-user-id');
  if (!userId) {
    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;
    if (tokenPayload?.userId) {
      userId = tokenPayload.userId;
    }
  }
  if (!userId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  if (!(await aiRateLimiter.isAllowed(userId))) {
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Coba lagi sebentar.' },
      { status: 429 },
    );
  }

  const parsed = parseBody(QuizRegenerateSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const { courseId, moduleTitle, subtopicTitle } = parsed.data;

  // Pull cached subtopic content to use as context for the new questions.
  const cacheKey = `${courseId}-${moduleTitle}-${subtopicTitle}`;
  const { data: cached } = await adminDb
    .from('subtopic_cache')
    .select('content')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (!cached?.content) {
    return NextResponse.json(
      { error: 'Konten subtopik tidak ditemukan. Silakan buka subtopik dulu.' },
      { status: 404 },
    );
  }

  // Build a concise context blob from the cached pages + key takeaways.
  const content = cached.content as {
    pages?: Array<{ title?: string; paragraphs?: string[] }>;
    keyTakeaways?: string[];
  };

  const pagesText = (content.pages ?? [])
    .map((p) => `${p.title ?? ''}\n${(p.paragraphs ?? []).join(' ')}`)
    .join('\n\n')
    .slice(0, 3500);
  const takeawaysText = (content.keyTakeaways ?? []).join('\n- ');

  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: [
      'You generate fresh multiple-choice quiz questions in strict JSON format.',
      'Language policy: match the language of the provided material; do not translate technical terms.',
      'Rules:',
      '- Output exactly 5 questions.',
      '- Each question must have 4 options.',
      '- correctIndex is the 0-based index of the correct option.',
      '- Questions must be DIFFERENT from any previous set for this subtopic (reshuffle).',
      '- Vary question angles: conceptual, applied, comparison, cause-effect, edge case.',
      '- Output ONLY this JSON shape: {"quiz":[{"question":"...","options":["a","b","c","d"],"correctIndex":0}]}',
    ].join('\n'),
  };

  const userMessage: ChatCompletionMessageParam = {
    role: 'user',
    content: [
      `Module: ${moduleTitle}`,
      `Subtopic: ${subtopicTitle}`,
      '',
      'Key takeaways:',
      `- ${takeawaysText}`,
      '',
      'Material:',
      pagesText,
      '',
      'Generate 5 NEW quiz questions (different angle than typical questions on this topic).',
    ].join('\n'),
  };

  let quizItems: QuizOutputItem[] = [];
  try {
    const resp = await chatCompletion({
      messages: [systemMessage, userMessage],
      maxTokens: 1500,
      timeoutMs: 45_000,
    });

    const raw = resp.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const sanitized = cleaned.replace(/,(?=\s*?[}\]])/g, '').trim();

    const parsedJson = JSON.parse(sanitized) as { quiz?: unknown };
    if (Array.isArray(parsedJson.quiz)) {
      quizItems = (parsedJson.quiz as QuizOutputItem[])
        .filter(
          (q) =>
            q &&
            typeof q.question === 'string' &&
            Array.isArray(q.options) &&
            q.options.length === 4 &&
            typeof q.correctIndex === 'number',
        )
        .slice(0, 5);
    }
  } catch (aiError) {
    console.error('[QuizRegenerate] AI generation failed', aiError);
    return NextResponse.json(
      { error: 'Gagal menghasilkan kuis baru. Coba lagi.' },
      { status: 500 },
    );
  }

  if (quizItems.length < 5) {
    return NextResponse.json(
      { error: 'Jumlah soal yang dihasilkan kurang dari 5. Coba lagi.' },
      { status: 500 },
    );
  }

  // Append new quiz rows to the `quiz` table (old rows preserved).
  await appendNewQuizQuestions({
    adminDb,
    courseId,
    moduleTitle,
    subtopicTitle,
    quizItems,
  });

  // Update subtopic_cache so the next page load serves the new questions.
  try {
    const updatedContent = { ...(cached.content as Record<string, unknown>), quiz: quizItems, quiz_regenerated_at: new Date().toISOString() };
    await adminDb
      .from('subtopic_cache')
      .eq('cache_key', cacheKey)
      .update({ content: updatedContent });
  } catch (cacheError) {
    console.warn('[QuizRegenerate] Cache update failed (new quiz still usable via response)', cacheError);
  }

  return NextResponse.json({
    success: true,
    quiz: quizItems,
  });
}

export const POST = withApiLogging(postHandler, { label: 'quiz-regenerate' });
