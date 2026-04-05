import { z } from 'zod';
import { NextResponse } from 'next/server';

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

export const GenerateCourseSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  goal: z.string().min(1, 'Goal is required'),
  level: z.string().min(1, 'Level is required'),
  extraTopics: z.string().optional(),
  problem: z.string().optional(),
  assumption: z.string().optional(),
  userId: z.string().optional(),
  userEmail: z.string().optional(),
});

export const GenerateSubtopicSchema = z.object({
  module: z.string().min(1, 'module is required'),
  subtopic: z.string().min(1, 'subtopic is required'),
  courseId: z.string().optional(),
});

// ── Quiz schemas ────────────────────────────────────────────────────

const QuizAnswerSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  userAnswer: z.string(),
  isCorrect: z.boolean(),
  questionIndex: z.number(),
  reasoningNote: z.string().optional(),
});

export const QuizSubmitSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  subtopic: z.string().min(1, 'Subtopic is required'),
  moduleTitle: z.string().optional(),
  subtopicTitle: z.string().optional(),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  score: z.number(),
  answers: z.array(QuizAnswerSchema).min(1, 'Quiz answers are required'),
  reasoningNotes: z.array(z.string()).optional(),
});

// ── AI feature schemas ──────────────────────────────────────────────

export const AskQuestionSchema = z.object({
  question: z.string().min(1, 'Question is required'),
  context: z.string().min(1, 'Context is required'),
  userId: z.string().min(1, 'User identifier is required'),
  courseId: z.string().min(1, 'Course ID is required'),
  subtopic: z.string().optional(),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  pageNumber: flexibleIndex,
  promptComponents: z.record(z.string(), z.unknown()).optional().nullable(),
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

// ── Feedback & Jurnal schemas ───────────────────────────────────────
// Note: "jurnal" uses Indonesian spelling, matching the DB table and API routes.

export const FeedbackSchema = z
  .object({
    userId: z.string().min(1, 'userId is required'),
    courseId: z.string().min(1, 'courseId is required'),
    feedback: z.string().optional(),
    comment: z.string().optional(),
    subtopicId: z.string().optional(),
    subtopic: z.string().optional(),
    moduleIndex: flexibleIndex,
    subtopicIndex: flexibleIndex,
    rating: z.number().min(1).max(5).optional().nullable(),
  })
  .refine((d) => (d.comment ?? '').trim() || (d.feedback ?? '').trim(), {
    message: 'Comment is required',
  });

export const JurnalSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  courseId: z.string().min(1, 'courseId is required'),
  content: z.union([z.string().min(1), z.record(z.string(), z.unknown())]),
  subtopic: z.string().optional(),
  moduleIndex: flexibleIndex,
  subtopicIndex: flexibleIndex,
  type: z.string().optional(),
  understood: z.string().optional(),
  confused: z.string().optional(),
  strategy: z.string().optional(),
  promptEvolution: z.string().optional(),
  contentRating: z.number().optional(),
  contentFeedback: z.string().optional(),
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
