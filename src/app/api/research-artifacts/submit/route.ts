import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { verifyToken } from '@/lib/jwt';
import { parseBody } from '@/lib/schemas';
import { getCourseMode } from '@/lib/course-mode';
import { resolveResearchLearningSession } from '@/services/research-session.service';

const ARTIFACT_TYPES = [
  'pseudocode', 'flowchart', 'algorithm', 'solution',
  'trace_table', 'output_predictor', 'parsons', 'bug_hunt',
  'flowchart_builder', 'block_builder',
] as const;

const SubmitSchema = z.object({
  courseId: z.string().uuid(),
  subtopicId: z.string().uuid().optional().nullable(),
  leafSubtopicId: z.string().uuid().optional().nullable(),
  artifactType: z.enum(ARTIFACT_TYPES),
  artifactTitle: z.string().trim().max(200).optional(),
  artifactContent: z.string().min(1, 'artifactContent wajib diisi'),
  relatedPromptIds: z.array(z.string().uuid()).optional().default([]),
  interactionEvents: z.array(z.unknown()).optional().default([]),
  completionStatus: z.enum(['in_progress', 'submitted', 'abandoned']).optional().default('submitted'),
  componentScore: z.number().min(0).max(1).optional().nullable(),
}).strict();

async function postHandler(req: NextRequest) {
  const parsed = parseBody(SubmitSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const data = parsed.data;

  // Identity check — student-side endpoint, so we follow the same JWT/middleware
  // contract as ask-question / challenge-response.
  const token = req.cookies.get('access_token')?.value;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });

  const userId = payload.userId;
  const courseMode = await getCourseMode(data.courseId);
  const researchSession = await resolveResearchLearningSession({
    userId,
    courseId: data.courseId,
    mode: courseMode,
  });

  const timestamp = new Date().toISOString();
  const { data: inserted, error } = await adminDb
    .from('research_artifacts')
    .insert({
      user_id: userId,
      course_id: data.courseId,
      learning_session_id: researchSession.learningSessionId,
      artifact_type: data.artifactType,
      artifact_title: data.artifactTitle ?? null,
      artifact_content: data.artifactContent,
      related_prompt_ids: data.relatedPromptIds ?? [],
      interaction_events: data.interactionEvents ?? [],
      completion_status: data.completionStatus,
      component_score: data.componentScore ?? null,
      mode: courseMode,
      research_validity_status: 'valid',
      coding_status: 'uncoded',
      evidence_status: 'raw',
      source_type: 'artifact',
      data_collection_week: researchSession.dataCollectionWeek,
      artifact_metadata: {
        subtopic_id: data.subtopicId ?? null,
        leaf_subtopic_id: data.leafSubtopicId ?? null,
        submitted_at: timestamp,
      },
      created_at: timestamp,
      updated_at: timestamp,
    });

  if (error) {
    console.error('[research-artifacts/submit] insert error', error);
    return NextResponse.json({ error: 'Gagal menyimpan artefak.' }, { status: 500 });
  }

  const insertedId = (inserted as { id?: string } | null)?.id ?? null;
  return NextResponse.json({
    success: true,
    artifactId: insertedId,
    mode: courseMode,
    learningSessionId: researchSession.learningSessionId,
  });
}

export const POST = withApiLogging(withProtection(postHandler), {
  label: 'research-artifacts-submit',
});
