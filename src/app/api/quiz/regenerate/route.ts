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
import { appendNewQuizQuestions, buildSubtopicCacheKey } from '@/lib/quiz-sync';
import {
  mergeSubtopicCacheContent,
  sanitizeQuizForClient,
} from '@/lib/quiz-content';
import { parseBody } from '@/lib/schemas';
import { verifyToken } from '@/lib/jwt';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
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
  let userRole = req.headers.get('x-user-role') ?? undefined;
  if (!userId) {
    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;
    if (tokenPayload?.userId) {
      userId = tokenPayload.userId;
      userRole = userRole ?? tokenPayload.role;
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

  // Enforce ownership BEFORE fetching or mutating any course data.
  try {
    await assertCourseOwnership(userId, courseId, userRole);
  } catch (ownershipErr) {
    const asOwnership = toOwnershipError(ownershipErr);
    if (asOwnership) {
      return NextResponse.json(
        { error: asOwnership.message },
        { status: asOwnership.status },
      );
    }
    throw ownershipErr;
  }

  // Pull cached subtopic content to use as context for the new questions.
  // Must use the canonical (normalized) cache key so generate-subtopic's
  // writer and this reader land on the same row.
  const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, subtopicTitle);
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
  // Fail loudly when the insert did not land — previously this was awaited
  // without inspecting the result, so a DB error would silently succeed.
  const appendResult = await appendNewQuizQuestions({
    adminDb,
    courseId,
    moduleTitle,
    subtopicTitle,
    quizItems,
  });

  if (!appendResult || appendResult.insertedCount === 0) {
    console.error('[QuizRegenerate] Failed to persist new quiz rows', {
      courseId,
      moduleTitle,
      subtopicTitle,
      appendResult,
    });
    return NextResponse.json(
      { error: 'Gagal menyimpan kuis baru ke database. Coba lagi.' },
      { status: 500 },
    );
  }

  // Update subtopic_cache so the next page load serves the new questions.
  try {
    const updatedContent = mergeSubtopicCacheContent(
      cached.content as Record<string, unknown>,
      {
        ...(cached.content as Record<string, unknown>),
        quiz: quizItems,
        quiz_regenerated_at: new Date().toISOString(),
      },
    );
    const { error: cacheError } = await adminDb
      .from('subtopic_cache')
      .eq('cache_key', cacheKey)
      .update({ content: updatedContent });

    if (cacheError) {
      throw cacheError;
    }
  } catch (cacheError) {
    console.error('[QuizRegenerate] Cache update failed after quiz rows were inserted', {
      cacheError,
      courseId,
      moduleTitle,
      subtopicTitle,
    });
    return NextResponse.json(
      {
        error: 'Kuis baru tersimpan, tetapi cache materi gagal diperbarui. Silakan muat ulang halaman sebelum mencoba lagi.',
        code: 'QUIZ_CACHE_UPDATE_FAILED',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    quiz: sanitizeQuizForClient(quizItems),
  });
}

export const POST = withApiLogging(postHandler, { label: 'quiz-regenerate' });
