import { z } from 'zod';
import { NextResponse } from 'next/server';
import {
  hasStructuredReflectionContent,
  isStructuredReflectionComplete,
  normalizeReflectionType,
  parseStructuredReflectionFields,
} from './reflection-submission';

// ── Shared field definitions ────────────────────────────────────────

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

/** Password strength rules — matches the policy previously in validation.ts */
const strongPasswordField = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const flexibleIndex = z.union([z.number(), z.string()]).optional().nullable();

// ── Auth schemas ────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const RegisterSchema = z.object({
  email: emailField,
  password: strongPasswordField,
  name: z.string().trim().optional().nullable(),
});

export const AdminLoginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Email dan password wajib diisi'),
});

/** Same password strength as user registration — fixes Finding 6.1.2 */
export const AdminRegisterSchema = z.object({
  email: emailField,
  password: strongPasswordField,
});

// ── Course schemas ──────────────────────────────────────────────────

// Identity fields (userId / userEmail) are intentionally NOT part of this
// schema. The route derives the authenticated user from the JWT cookie and
// x-user-* headers set by withProtection — accepting them from the body
// would reopen an IDOR vector where a logged-in user could spoof a
// different `created_by` on the generated course.
export const GenerateCourseSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  goal: z.string().min(1, 'Goal is required'),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced'], {
    message: 'Level must be Beginner, Intermediate, or Advanced',
  }),
  extraTopics: z.string().optional(),
  problem: z.string().optional(),
  assumption: z.string().optional(),
}).strict();

// `module` and `subtopic` are both .trim().min(1) so an all-whitespace
// payload cannot reach quiz-sync — otherwise `normalizeSubtopicLabel`
// would collapse to '' and quiz rows for sibling subtopics would collide
// on the same (subtopic_id, '') scope key.
export const GenerateSubtopicSchema = z.object({
  module: z.string().trim().min(1, 'module is required'),
  subtopic: z.string().trim().min(1, 'subtopic is required'),
  courseId: z.string().min(1, 'courseId is required'),
  moduleId: z.string().optional(),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
});

// ── Quiz schemas ────────────────────────────────────────────────────

/**
 * Query params accepted by GET /api/quiz/status.
 * At least one of `subtopicTitle` / `moduleTitle` is required so the route
 * can resolve the subtopic row before looking up submissions.
 */
export const QuizStatusSchema = z
  .object({
    courseId: z.string().min(1, 'courseId wajib'),
    subtopicTitle: z.string().trim().min(1).optional(),
    moduleTitle: z.string().trim().min(1).optional(),
  })
  .refine(
    (data) => !!(data.subtopicTitle || data.moduleTitle),
    { message: 'subtopicTitle atau moduleTitle wajib diisi' },
  );

const QuizAnswerSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4, 'Setiap soal harus memiliki 4 opsi'),
  userAnswer: z.string(),
  isCorrect: z.boolean(),
  questionIndex: z.number(),
  reasoningNote: z.string().optional(),
});

// moduleTitle + subtopicTitle are REQUIRED here (not optional) so lazy-seed
// recovery in /api/quiz/submit can always build a canonical cache key. If
// either is missing/empty we used to silently skip the recovery and return
// 404 "Pertanyaan kuis tidak ditemukan" even when the content existed.
export const QuizSubmitSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  subtopic: z.string().min(1, 'Subtopic is required'),
  moduleTitle: z.string().trim().min(1, 'moduleTitle wajib diisi'),
  subtopicTitle: z.string().trim().min(1, 'subtopicTitle wajib diisi'),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  score: z.number(),
  answers: z.array(QuizAnswerSchema).length(5, 'Quiz harus berisi tepat 5 jawaban'),
});

// ── AI feature schemas ──────────────────────────────────────────────

/**
 * Strict shape for the prompt-builder components sent by the AskQuestion
 * frontend. Mirrors `PromptComponents` in
 * `src/components/PromptBuilder/PromptBuilder.tsx`. `.strict()` rejects any
 * unknown field so the schema fails fast on accidental drift between
 * frontend and backend.
 */
export const PromptComponentsSchema = z
  .object({
    tujuan: z.string().optional(),
    konteks: z.string().optional(),
    batasan: z.string().optional(),
    reasoning: z.string().optional(),
  })
  .strict();

export const AskQuestionSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  context: z.string().min(1, 'Context is required'),
  userId: z.string().min(1, 'User identifier is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  subtopic: z.string().optional(),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  pageNumber: flexibleIndex,
  promptComponents: PromptComponentsSchema.optional().nullable(),
  reasoningNote: z.string().optional(),
  promptVersion: z.union([z.number(), z.string()]).optional(),
  sessionNumber: z.union([z.number(), z.string()]).optional(),
});

export const ChallengeThinkingSchema = z.object({
  context: z.string().min(1, 'Context is required'),
  level: z.string().optional().default('intermediate'),
});

export const ChallengeFeedbackSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  answer: z.string().min(1, 'Answer is required'),
  context: z.string().optional(),
  level: z.string().optional().default('intermediate'),
});

export const GenerateExamplesSchema = z.object({
  context: z.string().min(1, 'Missing context in request body'),
});

// Frontend sends these fields after the user submits their challenge
// answer — all are required for proper provenance in the
// `challenge_responses` table. Previously this endpoint parsed the body
// by hand, which silently accepted malformed payloads.
export const ChallengeResponseSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  courseId: z.string().trim().min(1, 'courseId is required'),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  subtopicLabel: z.string().trim().optional().default(''),
  pageNumber: flexibleIndex,
  question: z.string().trim().min(1, 'question is required'),
  answer: z.string().trim().min(1, 'answer is required'),
  feedback: z.string().optional().default(''),
  reasoningNote: z.string().optional().default(''),
});

// ── Feedback & Jurnal schemas ───────────────────────────────────────
// Note: "jurnal" uses Indonesian spelling, matching the DB table and API routes.

/**
 * Unified feedback schema (Bug #12 fix).
 *
 * The five canonical user-input fields for the feedback section are:
 *   1. `comment`        — written feedback (required, replaces legacy `feedback`)
 *   2. `rating`         — 1..5 star rating
 *   3. `subtopicId`     — UUID of the subtopic being rated
 *   4. `moduleIndex`    — module position
 *   5. `subtopicIndex`  — subtopic position within the module
 *
 * `userId` and `courseId` are required identifiers (not user-typed inputs),
 * and `subtopic` is an optional human-readable label fallback used when
 * `subtopicId` cannot be resolved against the database.
 */
export const FeedbackSchema = z
  .object({
    userId: z.string().min(1, 'userId is required').optional(),
    courseId: z.string().min(1, 'courseId is required'),
    comment: z
      .string()
      .trim()
      .min(1, 'Comment is required'),
    rating: z.number().min(1).max(5).optional().nullable(),
    subtopicId: z.string().optional().nullable(),
    moduleIndex: flexibleIndex,
    subtopicIndex: flexibleIndex,
    subtopic: z.string().optional(),
  })
  .strict();

export const JurnalSchema = z.object({
  userId: z.string().min(1, 'userId is required').optional(),
  courseId: z.string().min(1, 'courseId is required'),
  content: z.union([z.string().min(1), z.record(z.string(), z.unknown())]),
  // subtopicId = the `subtopics` table row id (per-module). Together with
  // subtopicLabel (the leaf subtopic title) these scope the jurnal row to a
  // specific subtopic so sibling reflections do not overwrite each other.
  subtopicId: z.string().optional(),
  subtopicLabel: z.string().optional(),
  subtopic: z.string().optional(),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  type: z.enum(['free_text', 'structured_reflection']).optional(),
  understood: z.string().optional(),
  confused: z.string().optional(),
  strategy: z.string().optional(),
  promptEvolution: z.string().optional(),
  contentRating: z.number().min(1).max(5).optional(),
  contentFeedback: z.string().optional(),
}).strict().superRefine((data, ctx) => {
  if (normalizeReflectionType(data.type) !== 'structured_reflection') return;

  const structured = parseStructuredReflectionFields(data);
  if (isStructuredReflectionComplete(structured)) return;

  if (hasStructuredReflectionContent(structured)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Structured reflection requires all reflection fields and rating',
      path: ['content'],
    });
    return;
  }

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: 'Structured reflection requires all reflection fields and rating',
    path: ['content'],
  });
});

// ── Learning profile schema ────────────────────────────────────────
// Note: `userId` is intentionally NOT part of this schema — the API route
// MUST derive it from the JWT payload to prevent IDOR-style overrides.
export const LearningProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'displayName diperlukan'),
  programmingExperience: z.string().trim().min(1, 'programmingExperience diperlukan'),
  learningStyle: z.string().trim().min(1, 'learningStyle diperlukan'),
  learningGoals: z.string().trim().optional().default(''),
  challenges: z.string().trim().optional().default(''),
});

// ── Helper ──────────────────────────────────────────────────────────

/**
 * Parse & validate a request body against a Zod schema.
 * Returns a typed result or a 400 NextResponse with the first error message.
 */
export function parseBody<T>(
  schema: z.ZodSchema<T>,
  body: unknown
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues[0]?.message || 'Invalid request body';
    return {
      success: false,
      response: NextResponse.json({ error: message }, { status: 400 }),
    };
  }
  return { success: true, data: result.data };
}
