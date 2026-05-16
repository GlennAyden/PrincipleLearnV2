import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyToken } from '@/lib/jwt';
import { computeCourseWeightedProgress } from '@/lib/course-unlock';

const isUuid = (v: string | undefined): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// NOTE: route folder uses `[id]` to match the sibling route at
// /api/courses/[id]/route.ts. Next.js refuses to bundle a project that has
// two different slug names at the same path level (`[id]` vs `[courseId]`),
// which previously caused INTERNAL_FUNCTION_INVOCATION_TIMEOUT for every
// /api/* route in production (the routing tree fails to init, so every
// Lambda hangs).
async function getHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get('access_token')?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });

  const { id: courseId } = await ctx.params;
  if (!isUuid(courseId)) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 });
  }

  // Fetch course meta to derive prereq via course_unlock_dependencies.
  const { data: courseRow } = await adminDb
    .from('courses')
    .select('id, template_topic, mode, title')
    .eq('id', courseId)
    .maybeSingle();
  const course = (courseRow as { id?: string; template_topic?: string | null; mode?: string; title?: string } | null) ?? null;
  if (!course) return NextResponse.json({ error: 'Course tidak ditemukan' }, { status: 404 });

  // Mode Umum: never locked.
  if (course.mode !== 'research' || !course.template_topic) {
    return NextResponse.json({
      success: true,
      courseId,
      templateTopic: course.template_topic ?? null,
      isUnlocked: true,
      prereqTemplateTopic: null,
      prereqProgress: null,
      currentProgress: null,
    });
  }

  const { data: depRow } = await adminDb
    .from('course_unlock_dependencies')
    .select('prereq_template_topic, unlock_threshold')
    .eq('course_template_topic', course.template_topic)
    .maybeSingle();

  const prereqTopic = (depRow as { prereq_template_topic?: string | null } | null)?.prereq_template_topic ?? null;
  const threshold = Number((depRow as { unlock_threshold?: number | string } | null)?.unlock_threshold ?? 0.7);

  if (!prereqTopic) {
    // Entry course (mengenal-algoritma) — always unlocked.
    const currentProgress = await computeCourseWeightedProgress(payload.userId, courseId, { threshold });
    return NextResponse.json({
      success: true,
      courseId,
      templateTopic: course.template_topic,
      isUnlocked: true,
      prereqTemplateTopic: null,
      prereqProgress: null,
      currentProgress: {
        averageScore: currentProgress.averageScore,
        perLeaf: currentProgress.perLeaf,
      },
    });
  }

  // Look up the prereq course for this user (a research-mode template, owned
  // by admin, but progress is computed per student).
  const { data: prereqCourse } = await adminDb
    .from('courses')
    .select('id')
    .eq('is_template', true)
    .eq('mode', 'research')
    .eq('template_topic', prereqTopic)
    .maybeSingle();
  const prereqCourseId = (prereqCourse as { id?: string } | null)?.id ?? null;

  if (!prereqCourseId) {
    return NextResponse.json({
      success: true,
      courseId,
      templateTopic: course.template_topic,
      isUnlocked: false,
      prereqTemplateTopic: prereqTopic,
      prereqProgress: null,
      currentProgress: null,
      error: 'Prereq course belum di-seed.',
    });
  }

  const prereqProgress = await computeCourseWeightedProgress(payload.userId, prereqCourseId, { threshold });
  const currentProgress = await computeCourseWeightedProgress(payload.userId, courseId, { threshold });

  return NextResponse.json({
    success: true,
    courseId,
    templateTopic: course.template_topic,
    isUnlocked: prereqProgress.meetsUnlockThreshold,
    prereqTemplateTopic: prereqTopic,
    unlockThreshold: threshold,
    prereqProgress: {
      averageScore: prereqProgress.averageScore,
      perLeaf: prereqProgress.perLeaf,
    },
    currentProgress: {
      averageScore: currentProgress.averageScore,
      perLeaf: currentProgress.perLeaf,
    },
  });
}

// Middleware (middleware.ts) already enforces JWT verification + role check
// for every /api/* route, so we can apply withApiLogging directly. We do not
// chain withProtection here because that wrapper does not support dynamic
// route `ctx: { params }` signatures.
export const GET = withApiLogging(getHandler, {
  label: 'courses-unlock-status',
});
