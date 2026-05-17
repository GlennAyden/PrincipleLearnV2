/**
 * POST /api/admin/research/export/bundle
 *
 * Generate a ZIP archive containing 6 research CSV files + README.md:
 *   prompts.csv          — prompt_classifications joined with ask_question_history
 *   cognitive_scores.csv — auto_cognitive_scores flatten
 *   artifacts.csv        — research_artifacts (id, type, score, status)
 *   triangulation.csv    — triangulation_records
 *   participants.csv     — users (participant_code only) + learning_profiles (no PII)
 *   README.md            — timestamp, filter parameters, row counts per file
 *
 * Body: { from?: ISO, to?: ISO, courseId?: UUID, userId?: UUID }
 * Response: application/zip, Content-Disposition attachment
 *
 * Auth: admin + assertResearchModeOnly (Mode Penelitian only)
 */

import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';

// ── types ────────────────────────────────────────────────────────────────────

interface BundleBody {
  from?: string;
  to?: string;
  courseId?: string;
  userId?: string;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  return Papa.unparse(rows);
}

// ── data fetchers ─────────────────────────────────────────────────────────────

async function fetchPrompts(filters: BundleBody): Promise<Record<string, unknown>[]> {
  let q = adminDb
    .from('prompt_classifications')
    .select(
      'id, prompt_id, prompt_source, user_id, course_id, prompt_text, prompt_stage, prompt_stage_score, classified_by, classification_method, agreement_status, researcher_notes, mode, created_at',
    )
    .eq('mode', 'research')
    .order('created_at', { ascending: true });

  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.courseId) q = q.eq('course_id', filters.courseId);
  if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`);

  const { data, error } = await q;
  if (error) throw new Error(`prompts: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchCognitiveScores(filters: BundleBody): Promise<Record<string, unknown>[]> {
  let q = adminDb
    .from('auto_cognitive_scores')
    .select(
      'id, source_id, source_type, user_id, course_id, ct_total_score, cth_total_score, cognitive_depth_level, score_version, mode, created_at',
    )
    .eq('mode', 'research')
    .order('created_at', { ascending: true });

  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.courseId) q = q.eq('course_id', filters.courseId);
  if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`);

  const { data, error } = await q;
  if (error) throw new Error(`cognitive_scores: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchArtifacts(filters: BundleBody): Promise<Record<string, unknown>[]> {
  let q = adminDb
    .from('research_artifacts')
    .select(
      'id, user_id, course_id, artifact_type, completion_status, component_score, mode, created_at',
    )
    .eq('mode', 'research')
    .order('created_at', { ascending: true });

  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.courseId) q = q.eq('course_id', filters.courseId);
  if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`);

  const { data, error } = await q;
  if (error) throw new Error(`artifacts: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

async function fetchTriangulation(filters: BundleBody): Promise<Record<string, unknown>[]> {
  let q = adminDb
    .from('triangulation_records')
    .select('id, user_id, course_id, evidence_ids, consensus_label, confidence, created_at')
    .order('created_at', { ascending: true });

  if (filters.userId) q = q.eq('user_id', filters.userId);
  if (filters.courseId) q = q.eq('course_id', filters.courseId);
  if (filters.from) q = q.gte('created_at', `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte('created_at', `${filters.to}T23:59:59`);

  const { data, error } = await q;
  if (error) throw new Error(`triangulation: ${error.message}`);
  // Flatten evidence_ids array to JSON string to keep CSV flat.
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...r,
    evidence_ids: Array.isArray(r.evidence_ids) ? r.evidence_ids.join(';') : r.evidence_ids,
  }));
}

async function fetchParticipants(filters: BundleBody): Promise<Record<string, unknown>[]> {
  // Resolve user IDs if scoped by userId.
  let userIds: string[] | null = null;
  if (filters.userId) {
    userIds = [filters.userId];
  }

  // Fetch users with only anonymised fields — no email.
  let userQ = adminDb
    .from('users')
    .select('id, participant_code, created_at')
    .eq('role', 'STUDENT');
  if (userIds) userQ = userQ.in('id', userIds);

  const { data: users, error: uErr } = await userQ;
  if (uErr) throw new Error(`participants (users): ${uErr.message}`);

  const ids = ((users ?? []) as Array<{ id: string }>).map((u) => u.id);
  if (ids.length === 0) return [];

  // Fetch learning_profiles — exclude PII (no name/email columns, but drop any
  // raw user_id in favor of participant_code for the output).
  const { data: profiles, error: pErr } = await adminDb
    .from('learning_profiles')
    .select(
      'user_id, school, grade, preferred_language, learning_style, intro_slides_completed, mode, created_at',
    )
    .in('user_id', ids);
  if (pErr) throw new Error(`participants (profiles): ${pErr.message}`);

  const codeMap = new Map<string, string>(
    ((users ?? []) as Array<{ id: string; participant_code: string | null }>).map((u) => [
      u.id,
      u.participant_code ?? `ANON-${u.id.slice(0, 8)}`,
    ]),
  );

  return ((profiles ?? []) as Array<{ user_id: string } & Record<string, unknown>>).map((p) => ({
    participant_code: codeMap.get(p.user_id) ?? `ANON-${p.user_id.slice(0, 8)}`,
    school: p.school,
    grade: p.grade,
    preferred_language: p.preferred_language,
    learning_style: p.learning_style,
    intro_slides_completed: p.intro_slides_completed,
    mode: p.mode,
    joined_at: p.created_at,
  }));
}

// ── README generator ─────────────────────────────────────────────────────────

function buildReadme(
  filters: BundleBody,
  counts: Record<string, number>,
  generatedAt: string,
): string {
  const filterLines = [
    filters.from ? `- from: ${filters.from}` : null,
    filters.to ? `- to: ${filters.to}` : null,
    filters.courseId ? `- courseId: ${filters.courseId}` : null,
    filters.userId ? `- userId: ${filters.userId}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const fileLines = Object.entries(counts)
    .map(([file, rows]) => `| ${file} | ${rows} baris |`)
    .join('\n');

  return `# Research Bundle — PrincipleLearn V3

Generated: ${generatedAt}

## Filter Parameters
${filterLines || '(tidak ada filter — semua data Mode Penelitian)'}

## Files

| File | Baris |
|------|-------|
${fileLines}

## Column Notes

- **prompts.csv**: Data klasifikasi prompt RM2 (Mode Penelitian). Kolom \`prompt_text\` berisi teks prompt siswa; \`prompt_stage\` berisi tahap SCP/SRP/MQP/REFLECTIVE.
- **cognitive_scores.csv**: Skor kognitif otomatis (auto_cognitive_scores) per prompt/artefak RM3.
- **artifacts.csv**: Artefak interaktif (research_artifacts) dengan skor komponen dan status.
- **triangulation.csv**: Rekaman triangulasi evidence (\`evidence_ids\` dipisah dengan titik koma).
- **participants.csv**: Data peserta yang dianonimkan — hanya \`participant_code\` (bukan email/nama asli).

## Codebook

Lihat \`docs/thesis/CODEBOOK_RM2_RM3.md\` untuk definisi stage, dimensi CT/CrT, dan rubrik skor.

---
*Bundle ini dihasilkan otomatis oleh sistem untuk keperluan lampiran tesis.*
`;
}

// ── handler ───────────────────────────────────────────────────────────────────

async function postHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: BundleBody = {};
  try {
    body = (await req.json()) as BundleBody;
  } catch {
    // empty body is fine — no filters applied
  }

  const generatedAt = new Date().toISOString();

  // Fetch all data in parallel.
  const [prompts, cogScores, artifacts, triangulation, participants] = await Promise.all([
    fetchPrompts(body),
    fetchCognitiveScores(body),
    fetchArtifacts(body),
    fetchTriangulation(body),
    fetchParticipants(body),
  ]);

  const files: Record<string, Record<string, unknown>[]> = {
    'prompts.csv': prompts,
    'cognitive_scores.csv': cogScores,
    'artifacts.csv': artifacts,
    'triangulation.csv': triangulation,
    'participants.csv': participants,
  };

  const counts: Record<string, number> = Object.fromEntries(
    Object.entries(files).map(([name, rows]) => [name, rows.length]),
  );

  // Build ZIP.
  const zip = new JSZip();
  for (const [filename, rows] of Object.entries(files)) {
    zip.file(filename, toCsv(rows));
  }
  zip.file('README.md', buildReadme(body, counts, generatedAt));

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const ts = generatedAt.replace(/[-:]/g, '').replace('T', '-').slice(0, 13);
  const filename = `research-bundle-${ts}.zip`;

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(zipBuffer.length),
    },
  });
}

export const POST = withApiLogging(postHandler, { label: 'admin-research-export-bundle' });
