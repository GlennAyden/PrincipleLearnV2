import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { verifyToken } from '@/lib/jwt';
import { computeCourseWeightedProgress } from '@/lib/course-unlock';

interface CourseTemplateRow {
  id: string;
  title: string;
  description: string | null;
  template_topic: string;
  source_reference: string | null;
  difficulty_level: string | null;
  estimated_duration: number | null;
}

interface UnlockDependencyRow {
  course_template_topic: string;
  prereq_template_topic: string | null;
  unlock_threshold: number | string | null;
  display_order: number;
}

interface ResearchTemplatePayload {
  id: string;
  templateTopic: string;
  title: string;
  description: string;
  sourceReference: string | null;
  difficultyLevel: string | null;
  estimatedDuration: number | null;
  displayOrder: number;
  prereqTemplateTopic: string | null;
  unlockThreshold: number;
  // Full unlock status (with progress %) will be wired in Item 7b W7.
  // For W2 first cut we expose only the static "no prereq required" flag so
  // Step1 UI can show a locked badge for courses 2-4 until the helper lands.
  isUnlocked: boolean;
  lockReason: string | null;
}

async function getHandler(req: NextRequest) {
  try {
    const token = req.cookies.get('access_token')?.value;
    const userPayload = token ? verifyToken(token) : null;

    const [{ data: templateRows, error: templateError }, { data: depRows, error: depError }] =
      await Promise.all([
        adminDb
          .from('courses')
          .select('id, title, description, template_topic, source_reference, difficulty_level, estimated_duration')
          .eq('is_template', true)
          .eq('mode', 'research'),
        adminDb
          .from('course_unlock_dependencies')
          .select('course_template_topic, prereq_template_topic, unlock_threshold, display_order'),
      ]);

    if (templateError || depError) {
      console.error('[ResearchTemplates] DB error', { templateError, depError });
      return NextResponse.json({ error: 'Gagal memuat template kursus penelitian.' }, { status: 500 });
    }

    const templates = (templateRows ?? []) as CourseTemplateRow[];
    const dependencies = (depRows ?? []) as UnlockDependencyRow[];
    const depByTopic = new Map(dependencies.map((d) => [d.course_template_topic, d]));
    const courseIdByTopic = new Map(templates.map((t) => [t.template_topic, t.id] as const));

    // For each template, compute the user's progress on its PREREQ course so
    // we can mark "unlocked" / lockReason. Entry course (no prereq) is always
    // unlocked. computeCourseWeightedProgress uses an in-memory 60s cache so
    // 4 invocations per request are cheap on repeat hits.
    const userId = userPayload?.userId;
    const prereqProgressByTopic = new Map<string, number>();
    if (userId) {
      const uniquePrereqs = Array.from(new Set(
        dependencies.map((d) => d.prereq_template_topic).filter((t): t is string => !!t),
      ));
      await Promise.all(uniquePrereqs.map(async (prereqTopic) => {
        const prereqCourseId = courseIdByTopic.get(prereqTopic);
        if (!prereqCourseId) return;
        const prog = await computeCourseWeightedProgress(userId, prereqCourseId);
        prereqProgressByTopic.set(prereqTopic, prog.averageScore);
      }));
    }

    const payload: ResearchTemplatePayload[] = templates
      .filter((tpl) => !!tpl.template_topic)
      .map((tpl) => {
        const dep = depByTopic.get(tpl.template_topic);
        const prereq = dep?.prereq_template_topic ?? null;
        const unlockThreshold = Number(dep?.unlock_threshold ?? 0.7);
        const prereqProgress = prereq ? prereqProgressByTopic.get(prereq) ?? 0 : 1;
        const isUnlocked = prereq === null || prereqProgress >= unlockThreshold;
        return {
          id: tpl.id,
          templateTopic: tpl.template_topic,
          title: tpl.title,
          description: tpl.description ?? '',
          sourceReference: tpl.source_reference,
          difficultyLevel: tpl.difficulty_level,
          estimatedDuration: tpl.estimated_duration,
          displayOrder: dep?.display_order ?? 999,
          prereqTemplateTopic: prereq,
          unlockThreshold,
          isUnlocked,
          lockReason: isUnlocked
            ? null
            : `Selesaikan dulu course "${prereq}" (≥ ${Math.round(unlockThreshold * 100)}%). Progres kamu saat ini: ${Math.round(prereqProgress * 100)}%.`,
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);

    return NextResponse.json({ success: true, templates: payload });
  } catch (error) {
    console.error('[ResearchTemplates] Unexpected error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiLogging(withProtection(getHandler), {
  label: 'courses-research-templates',
});
