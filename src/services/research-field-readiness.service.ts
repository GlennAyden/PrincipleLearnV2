import { adminDb } from '@/lib/database';
import { formatAnonParticipant, getWeekBucket } from '@/lib/research-normalizers';

export type ReadinessStatus = 'siap_tesis' | 'sebagian' | 'perlu_data';
export type FieldCheckStatus = 'ready' | 'partial' | 'blocked';

interface StudentRow {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  created_at?: string | null;
}

interface CountedRow {
  [key: string]: unknown;
  id: string;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  session_date?: string | null;
  created_at?: string | null;
  prompt_stage?: string | null;
  evidence_text?: string | null;
  convergence_status?: string | null;
  triangulation_status?: string | null;
  indicator_code?: string | null;
  source_type?: string | null;
  coding_status?: string | null;
  research_validity_status?: string | null;
  readiness_status?: string | null;
  readiness_score?: number | null;
  is_valid_for_analysis?: boolean | null;
}

interface AutoCodingRunRow {
  id: string;
  status?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
  summary?: Record<string, unknown> | null;
}

export interface ReadinessRow {
  user_id: string;
  student_name: string;
  student_email: string | null;
  anonymous_id: string;
  readiness_status: ReadinessStatus;
  readiness_score: number;
  rm2_complete: boolean;
  rm3_complete: boolean;
  blockers: string[];
  next_steps: string[];
  next_step: string;
  evidence_counts: Record<string, number>;
  weekly_coverage: string[];
  classification_count: number;
  indicator_count: number;
  auto_score_count: number;
  evidence_item_count: number;
  coded_evidence_count: number;
  session_count: number;
  profile_complete: boolean;
  indicator_coverage_12: {
    covered_count: number;
    total: number;
    covered_indicators: string[];
    missing_indicators: string[];
  };
  missing_indicators: string[];
  triangulation_status_counts: Record<string, number>;
  source_coverage: Record<string, number>;
}

export interface FieldReadinessCheck {
  id: string;
  label: string;
  rm_focus: 'RM2' | 'RM3' | 'RM2_RM3' | 'FIELD';
  status: FieldCheckStatus;
  metric: string;
  detail: string;
  next_step: string;
}

export interface FieldReadinessSummary {
  status: FieldCheckStatus;
  score: number;
  observed_weeks: number;
  target_weeks: number;
  week_buckets: string[];
  collection_start: string | null;
  collection_end: string | null;
  pipeline_counts: Record<string, number>;
  coverage_rates: Record<string, number>;
  latest_auto_coding_run: AutoCodingRunRow | null;
  checklist: FieldReadinessCheck[];
  priority_actions: string[];
  thesis_outputs: FieldReadinessCheck[];
}

export interface ResearchReadinessSummary {
  total_students: number;
  ready_students: number;
  partial_students: number;
  blocked_students: number;
  average_readiness: number;
  rm2_ready_students: number;
  rm3_ready_students: number;
  field_readiness_score: number;
  field_readiness_status: FieldCheckStatus;
}

export interface ResearchReadinessSnapshot {
  generated_at: string;
  summary: ResearchReadinessSummary;
  field_readiness: FieldReadinessSummary;
  rows: ReadinessRow[];
}

interface SnapshotParams {
  userId?: string | null;
  courseId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

const CT_KEYS = [
  'ct_decomposition',
  'ct_pattern_recognition',
  'ct_abstraction',
  'ct_algorithm_design',
  'ct_evaluation_debugging',
  'ct_generalization',
] as const;

const CTH_KEYS = [
  'cth_interpretation',
  'cth_analysis',
  'cth_evaluation',
  'cth_inference',
  'cth_explanation',
  'cth_self_regulation',
] as const;

const INDICATOR_KEYS = [...CT_KEYS, ...CTH_KEYS] as const;

export async function buildResearchReadinessSnapshot(params: SnapshotParams = {}): Promise<ResearchReadinessSnapshot> {
  const userId = params.userId || undefined;
  const courseId = params.courseId || undefined;
  const startDate = params.startDate || undefined;
  const endDate = params.endDate || undefined;

  const [
    users,
    profiles,
    sessions,
    rawLogs,
    classifications,
    indicators,
    autoScores,
    evidenceItems,
    artifacts,
    triangulation,
    journals,
    discussions,
    autoCodingRuns,
  ] = await Promise.all([
    fetchUsers(userId),
    fetchRows('learning_profiles', 'id, user_id', userId),
    fetchRows('learning_sessions', 'id, user_id, course_id, session_date, session_number, is_valid_for_analysis', userId, courseId, { startDate, endDate, dateColumn: 'session_date' }),
    fetchRows('ask_question_history', 'id, user_id, course_id, learning_session_id, created_at, prompt_stage, question, answer', userId, courseId, { startDate, endDate }),
    fetchRows('prompt_classifications', 'id, user_id, course_id, created_at, prompt_stage, learning_session_id', userId, courseId, { startDate, endDate }),
    fetchRows('cognitive_indicators', `id, user_id, created_at, evidence_text, prompt_classification_id, ${INDICATOR_KEYS.join(', ')}`, userId, undefined, { startDate, endDate }),
    fetchRows('auto_cognitive_scores', `id, user_id, course_id, created_at, prompt_stage, evidence_summary, ${INDICATOR_KEYS.join(', ')}`, userId, courseId, { startDate, endDate }),
    fetchRows('research_evidence_items', 'id, user_id, course_id, learning_session_id, created_at, source_type, coding_status, research_validity_status', userId, courseId, { startDate, endDate }),
    fetchRows('research_artifacts', 'id, user_id, course_id, created_at, artifact_type', userId, courseId, { startDate, endDate }),
    fetchRows('triangulation_records', 'id, user_id, course_id, created_at, convergence_status, triangulation_status, indicator_code', userId, courseId, { startDate, endDate }),
    fetchRows('jurnal', 'id, user_id, created_at', userId, undefined, { startDate, endDate }),
    fetchRows('discussion_sessions', 'id, user_id, course_id, created_at', userId, courseId, { startDate, endDate }),
    fetchAutoCodingRuns(),
  ]);

  const collectionStart = getCollectionStart([
    ...rawLogs,
    ...evidenceItems,
    ...sessions,
    ...classifications,
    ...indicators,
    ...autoScores,
  ]);
  const collectionEnd = getCollectionEnd([
    ...rawLogs,
    ...evidenceItems,
    ...sessions,
    ...classifications,
    ...indicators,
    ...autoScores,
  ]);

  const students = users.filter((user) => (user.role ?? 'student').toLowerCase() !== 'admin');
  const studentIds = students.length > 0
    ? students.map((student) => student.id)
    : Array.from(new Set([
      ...rawLogs.map((row) => row.user_id),
      ...classifications.map((row) => row.user_id),
      ...indicators.map((row) => row.user_id),
      ...autoScores.map((row) => row.user_id),
      ...evidenceItems.map((row) => row.user_id),
    ].filter(Boolean)));

  const studentLookup = new Map(students.map((student) => [student.id, student]));
  const rows = studentIds.map((studentId, index) => {
    const student = studentLookup.get(studentId);
    return buildReadinessRow({
      studentId,
      student,
      anonymousId: formatAnonParticipant(index),
      collectionStart,
      profiles,
      sessions,
      rawLogs,
      classifications,
      indicators,
      autoScores,
      evidenceItems,
      artifacts,
      triangulation,
      journals,
      discussions,
    });
  }).sort((a, b) => b.readiness_score - a.readiness_score);

  const total = rows.length;
  const ready = rows.filter((row) => row.readiness_status === 'siap_tesis').length;
  const partial = rows.filter((row) => row.readiness_status === 'sebagian').length;
  const blocked = rows.filter((row) => row.readiness_status === 'perlu_data').length;

  const fieldReadiness = buildFieldReadinessSummary({
    rows,
    sessions,
    rawLogs,
    classifications,
    indicators,
    autoScores,
    evidenceItems,
    artifacts,
    triangulation,
    journals,
    discussions,
    autoCodingRuns,
    collectionStart,
    collectionEnd,
  });

  return {
    generated_at: new Date().toISOString(),
    summary: {
      total_students: total,
      ready_students: ready,
      partial_students: partial,
      blocked_students: blocked,
      average_readiness: total > 0 ? round(rows.reduce((sum, row) => sum + row.readiness_score, 0) / total) : 0,
      rm2_ready_students: rows.filter((row) => row.rm2_complete).length,
      rm3_ready_students: rows.filter((row) => row.rm3_complete).length,
      field_readiness_score: fieldReadiness.score,
      field_readiness_status: fieldReadiness.status,
    },
    field_readiness: fieldReadiness,
    rows,
  };
}

async function fetchUsers(userId?: string | null): Promise<StudentRow[]> {
  let query = adminDb.from('users').select('id, name, email, role, created_at');
  if (userId) query = query.eq('id', userId);
  query = query.order('created_at', { ascending: true });
  const { data } = await query;
  return (data ?? []) as StudentRow[];
}

async function fetchRows(
  table: string,
  select: string,
  userId?: string | null,
  courseId?: string | null,
  options?: { startDate?: string; endDate?: string; dateColumn?: string },
): Promise<CountedRow[]> {
  try {
    let query = adminDb.from(table).select(select);
    if (userId) query = query.eq('user_id', userId);
    if (courseId && select.includes('course_id')) query = query.eq('course_id', courseId);
    const dateColumn = options?.dateColumn ?? 'created_at';
    if (options?.startDate && select.includes(dateColumn)) {
      const value = dateColumn === 'created_at' ? `${options.startDate}T00:00:00` : options.startDate;
      query = query.gte(dateColumn, value);
    }
    if (options?.endDate && select.includes(dateColumn)) {
      const value = dateColumn === 'created_at' ? `${options.endDate}T23:59:59` : options.endDate;
      query = query.lte(dateColumn, value);
    }
    const { data, error } = await query;
    if (error) return [];
    return (data ?? []) as CountedRow[];
  } catch {
    return [];
  }
}

async function fetchAutoCodingRuns(): Promise<AutoCodingRunRow[]> {
  try {
    const { data, error } = await adminDb
      .from('research_auto_coding_runs')
      .select('id, status, created_at, completed_at, summary')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return [];
    return (data ?? []) as AutoCodingRunRow[];
  } catch {
    return [];
  }
}

function buildReadinessRow(input: {
  studentId: string;
  student?: StudentRow;
  anonymousId: string;
  collectionStart: Date | null;
  profiles: CountedRow[];
  sessions: CountedRow[];
  rawLogs: CountedRow[];
  classifications: CountedRow[];
  indicators: CountedRow[];
  autoScores: CountedRow[];
  evidenceItems: CountedRow[];
  artifacts: CountedRow[];
  triangulation: CountedRow[];
  journals: CountedRow[];
  discussions: CountedRow[];
}): ReadinessRow {
  const byUser = (rows: CountedRow[]) => rows.filter((row) => row.user_id === input.studentId);
  const profileCount = byUser(input.profiles).length;
  const userSessions = byUser(input.sessions);
  const userRawLogs = byUser(input.rawLogs);
  const userClassifications = byUser(input.classifications);
  const userIndicators = byUser(input.indicators);
  const userAutoScores = byUser(input.autoScores);
  const userEvidence = byUser(input.evidenceItems);
  const userArtifacts = byUser(input.artifacts);
  const userTriangulation = byUser(input.triangulation);
  const userJournals = byUser(input.journals);
  const userDiscussions = byUser(input.discussions);
  const indicatorCoverage = buildIndicatorCoverage(userIndicators, userAutoScores, userTriangulation);
  const triangulationStatusCounts = countTriangulationStatuses(userTriangulation);

  const weeklyBuckets = new Set(userRawLogs.map((row) => getWeekBucket(row.created_at, input.collectionStart)));
  const stageCoverage = new Set(userClassifications.map((row) => row.prompt_stage).filter(Boolean));
  const scoredUnits = userIndicators.length + userAutoScores.length;
  const validSessions = userSessions.filter((row) => row.is_valid_for_analysis !== false).length;
  const codedEvidence = userEvidence.filter((row) => row.coding_status && row.coding_status !== 'uncoded').length;
  const validEvidence = userEvidence.filter((row) => row.research_validity_status !== 'excluded').length;
  const evidenceUnits = Math.max(
    userIndicators.filter((row) => Boolean(row.evidence_text)).length + userArtifacts.length + userTriangulation.length,
    validEvidence,
  );
  const sourceCounts = {
    prompt_logs: countEvidenceSource(userEvidence, 'ask_question') || userRawLogs.length,
    artifacts: countEvidenceSource(userEvidence, 'artifact') || userArtifacts.length,
    journals: countEvidenceSource(userEvidence, 'journal') || userJournals.length,
    discussions: countEvidenceSource(userEvidence, 'discussion') || userDiscussions.length,
    challenges: countEvidenceSource(userEvidence, 'challenge_response'),
    quizzes: countEvidenceSource(userEvidence, 'quiz_submission'),
    evidence_items: userEvidence.length,
    coded_evidence: codedEvidence,
    longitudinal_observation: weeklyBuckets.size,
    triangulation: userTriangulation.length,
    valid_sessions: validSessions,
  };

  const scoreParts = [
    Math.min(15, userRawLogs.length * 2),
    Math.min(15, weeklyBuckets.size * 4),
    Math.min(20, userClassifications.length * 4),
    Math.min(20, scoredUnits * 4),
    Math.min(10, stageCoverage.size * 3),
    Math.min(10, evidenceUnits * 2),
    Math.min(10, codedEvidence * 3),
    Math.min(5, profileCount * 5),
    Math.min(5, userTriangulation.length * 5),
  ];
  const readinessScore = Math.min(100, scoreParts.reduce((sum, part) => sum + part, 0));
  const blockers = buildBlockers({
    rawLogs: userRawLogs.length,
    weeks: weeklyBuckets.size,
    validSessions,
    classifications: userClassifications.length,
    scoredUnits,
    codedEvidence,
    artifacts: userArtifacts.length,
    triangulation: userTriangulation.length,
    profileCount,
    indicatorCoverage: indicatorCoverage.covered_count,
  });
  const status = readinessScore >= 80 && blockers.length <= 1
    ? 'siap_tesis'
    : readinessScore >= 45
      ? 'sebagian'
      : 'perlu_data';
  const nextSteps = buildNextSteps(blockers);

  return {
    user_id: input.studentId,
    student_name: input.student?.name ?? input.student?.email ?? `Siswa ${input.anonymousId}`,
    student_email: input.student?.email ?? null,
    anonymous_id: input.anonymousId,
    readiness_status: status as ReadinessStatus,
    readiness_score: readinessScore,
    rm2_complete: userRawLogs.length > 0 && userClassifications.length > 0 && weeklyBuckets.size > 0 && validSessions > 0,
    rm3_complete: indicatorCoverage.covered_count >= 12 && evidenceUnits > 0 && codedEvidence > 0,
    blockers,
    next_steps: nextSteps,
    next_step: nextSteps[0] ?? 'Data siap dibaca sebagai bahan hasil penelitian.',
    evidence_counts: sourceCounts,
    weekly_coverage: Array.from(weeklyBuckets).sort(),
    classification_count: userClassifications.length,
    indicator_count: userIndicators.length,
    auto_score_count: userAutoScores.length,
    evidence_item_count: userEvidence.length,
    coded_evidence_count: codedEvidence,
    session_count: userSessions.length || weeklyBuckets.size,
    profile_complete: profileCount > 0,
    indicator_coverage_12: indicatorCoverage,
    missing_indicators: indicatorCoverage.missing_indicators,
    triangulation_status_counts: triangulationStatusCounts,
    source_coverage: sourceCounts,
  };
}

function buildFieldReadinessSummary(input: {
  rows: ReadinessRow[];
  sessions: CountedRow[];
  rawLogs: CountedRow[];
  classifications: CountedRow[];
  indicators: CountedRow[];
  autoScores: CountedRow[];
  evidenceItems: CountedRow[];
  artifacts: CountedRow[];
  triangulation: CountedRow[];
  journals: CountedRow[];
  discussions: CountedRow[];
  autoCodingRuns: AutoCodingRunRow[];
  collectionStart: Date | null;
  collectionEnd: Date | null;
}): FieldReadinessSummary {
  const weekBuckets = Array.from(new Set([
    ...input.rawLogs.map((row) => getWeekBucket(row.created_at, input.collectionStart)),
    ...input.evidenceItems.map((row) => getWeekBucket(row.created_at, input.collectionStart)),
  ].filter((week) => week !== 'Minggu Tidak Diketahui'))).sort(sortWeekBucket);
  const observedWeeks = weekBuckets.length;
  const studentTotal = input.rows.length;
  const rm2Ready = input.rows.filter((row) => row.rm2_complete).length;
  const rm3Ready = input.rows.filter((row) => row.rm3_complete).length;
  const codedEvidence = input.evidenceItems.filter((row) => row.coding_status && row.coding_status !== 'uncoded').length;
  const validEvidence = input.evidenceItems.filter((row) => row.research_validity_status !== 'excluded').length;
  const linkedEvidence = input.evidenceItems.filter((row) => Boolean(row.learning_session_id)).length;
  const stageCoverage = new Set(input.classifications.map((row) => row.prompt_stage).filter(Boolean));
  const latestRun = input.autoCodingRuns[0] ?? null;

  const pipelineCounts = {
    students: studentTotal,
    learning_sessions: input.sessions.length,
    raw_prompt_logs: input.rawLogs.length,
    prompt_classifications: input.classifications.length,
    cognitive_indicator_rows: input.indicators.length,
    auto_cognitive_scores: input.autoScores.length,
    evidence_items: input.evidenceItems.length,
    coded_evidence: codedEvidence,
    valid_evidence: validEvidence,
    linked_evidence_to_session: linkedEvidence,
    artifacts: input.artifacts.length,
    journals: input.journals.length,
    discussions: input.discussions.length,
    triangulation_records: input.triangulation.length,
  };

  const coverageRates = {
    rm2_student_completion: ratio(rm2Ready, studentTotal),
    rm3_student_completion: ratio(rm3Ready, studentTotal),
    evidence_coding: ratio(codedEvidence, input.evidenceItems.length),
    evidence_session_binding: ratio(linkedEvidence, input.evidenceItems.length),
    stage_coverage: ratio(stageCoverage.size, 4),
    observed_week_coverage: ratio(observedWeeks, 4),
  };

  const checklist: FieldReadinessCheck[] = [
    makeCheck({
      id: 'raw_prompt_ai_answers',
      label: 'Log prompt dan jawaban AI',
      rm_focus: 'RM2_RM3',
      value: input.rawLogs.length,
      partialAt: 1,
      readyAt: Math.max(10, studentTotal * 3),
      metric: `${input.rawLogs.length} log`,
      blockedDetail: 'Belum ada log prompt dan jawaban AI yang bisa menjadi data mentah.',
      partialDetail: 'Log sudah ada, tetapi volume awal masih perlu dipantau saat pengambilan data.',
      readyDetail: 'Log prompt dan jawaban AI sudah tersedia untuk pelacakan bukti.',
      nextStep: 'Minta siswa tetap memakai fitur belajar dan tanya jawab selama periode penelitian.',
    }),
    makeCheck({
      id: 'one_month_window',
      label: 'Cakupan longitudinal satu bulan',
      rm_focus: 'FIELD',
      value: observedWeeks,
      partialAt: 2,
      readyAt: 4,
      metric: `${observedWeeks}/4 minggu`,
      blockedDetail: 'Jejak mingguan belum cukup untuk membaca perkembangan longitudinal.',
      partialDetail: 'Jejak mingguan mulai terbentuk, tetapi belum penuh satu bulan.',
      readyDetail: 'Cakupan minggu sudah sesuai rancangan satu bulan.',
      nextStep: 'Gunakan ringkasan mingguan untuk membaca pola naik, stagnan, fluktuatif, dan anomali.',
    }),
    makeCheck({
      id: 'session_binding',
      label: 'Pengelompokan sesi belajar',
      rm_focus: 'RM2',
      value: input.sessions.length + linkedEvidence,
      partialAt: 1,
      readyAt: Math.max(3, studentTotal),
      metric: `${input.sessions.length} sesi, ${linkedEvidence} bukti bertaut sesi`,
      blockedDetail: 'Sesi belajar belum cukup jelas untuk membaca perjalanan tiap siswa.',
      partialDetail: 'Sebagian data sudah terkait sesi, tetapi perlu dijaga konsistensinya.',
      readyDetail: 'Sesi belajar dan evidence sudah cukup terbaca sebagai perjalanan siswa.',
      nextStep: 'Tinjau evidence tanpa session binding dari Evidence Bank.',
    }),
    makeCheck({
      id: 'rm2_prompt_coding',
      label: 'Coding tahap prompt RM2',
      rm_focus: 'RM2',
      value: input.classifications.length,
      partialAt: 1,
      readyAt: Math.max(10, studentTotal * 2),
      metric: `${input.classifications.length} klasifikasi, ${stageCoverage.size}/4 tahap muncul`,
      blockedDetail: 'Belum ada klasifikasi SCP/SRP/MQP/Reflektif.',
      partialDetail: 'Klasifikasi RM2 sudah mulai berjalan, tetapi belum kuat untuk seluruh perjalanan siswa.',
      readyDetail: 'Klasifikasi RM2 sudah cukup untuk dashboard dan export longitudinal.',
      nextStep: 'Jalankan auto-coder dan review klasifikasi yang confidence-nya rendah.',
    }),
    makeCheck({
      id: 'rm3_indicator_coding',
      label: 'Skor 12 indikator RM3',
      rm_focus: 'RM3',
      value: input.indicators.length + input.autoScores.length,
      partialAt: 1,
      readyAt: Math.max(10, studentTotal * 2),
      metric: `${input.indicators.length} manual, ${input.autoScores.length} otomatis`,
      blockedDetail: 'Belum ada skor indikator CT dan Critical Thinking.',
      partialDetail: 'Skor RM3 sudah muncul, tetapi bukti per indikator masih perlu dipantau.',
      readyDetail: 'Skor RM3 sudah tersedia untuk membaca manifestasi indikator.',
      nextStep: 'Prioritaskan indikator yang belum muncul sebagai temuan penting.',
    }),
    makeCheck({
      id: 'evidence_bank_coding',
      label: 'Evidence Bank siap telaah',
      rm_focus: 'RM2_RM3',
      value: codedEvidence,
      partialAt: 1,
      readyAt: Math.max(10, Math.ceil(input.evidenceItems.length * 0.5)),
      metric: `${codedEvidence}/${input.evidenceItems.length} bukti dikodekan`,
      blockedDetail: 'Evidence Bank belum memiliki bukti yang sudah dikodekan.',
      partialDetail: 'Evidence Bank sudah terisi, tetapi belum semua siap ditelusuri.',
      readyDetail: 'Evidence Bank siap dipakai untuk audit bukti RM2/RM3.',
      nextStep: 'Buka Evidence Bank untuk meninjau status validitas dan coding.',
    }),
    makeCheck({
      id: 'triangulation',
      label: 'Triangulasi kuat/sebagian/bertentangan',
      rm_focus: 'RM2_RM3',
      value: input.triangulation.length,
      partialAt: 1,
      readyAt: Math.max(12, studentTotal * 4),
      metric: `${input.triangulation.length} catatan triangulasi`,
      blockedDetail: 'Belum ada catatan triangulasi lintas sumber.',
      partialDetail: 'Triangulasi sudah mulai terbentuk dan perlu direview peneliti.',
      readyDetail: 'Triangulasi siap menjadi dasar interpretasi temuan.',
      nextStep: 'Generate triangulasi otomatis lalu review alasan tiap status.',
    }),
    {
      id: 'export_lampiran',
      label: 'Export lampiran tesis',
      rm_focus: 'FIELD',
      status: 'ready',
      metric: 'JSON/CSV tersedia',
      detail: 'Export sessions, classifications, indicators, evidence, longitudinal, readiness, all, dan SPSS tersedia dari admin.',
      next_step: 'Gunakan mode anonim saat lampiran dibagikan di luar tim penelitian.',
    },
  ];

  const thesisOutputs: FieldReadinessCheck[] = [
    {
      id: 'rm2_longitudinal_output',
      label: 'Output RM2: peta lintasan perkembangan prompt',
      rm_focus: 'RM2',
      status: statusFromRatio(coverageRates.rm2_student_completion),
      metric: `${rm2Ready}/${studentTotal} siswa siap RM2`,
      detail: 'Menggabungkan log prompt, sesi, klasifikasi tahap, dan cakupan mingguan.',
      next_step: 'Gunakan export longitudinal untuk menulis pola naik, stagnan, fluktuatif, atau anomali.',
    },
    {
      id: 'rm3_indicator_output',
      label: 'Output RM3: profil manifestasi CT dan Critical Thinking',
      rm_focus: 'RM3',
      status: statusFromRatio(coverageRates.rm3_student_completion),
      metric: `${rm3Ready}/${studentTotal} siswa siap RM3`,
      detail: 'Menggabungkan skor 12 indikator, bukti per sumber, dan status belum muncul.',
      next_step: 'Gunakan triangulasi untuk membedakan bukti kuat, sebagian, dan bertentangan.',
    },
    {
      id: 'audit_trail_output',
      label: 'Output audit trail: raw log, coding, dan alasan',
      rm_focus: 'FIELD',
      status: statusFromRatio(coverageRates.evidence_coding),
      metric: `${codedEvidence}/${input.evidenceItems.length} bukti berkode`,
      detail: 'Menjaga klaim tesis bisa ditelusuri dari grafik sampai teks mentah prompt dan jawaban AI.',
      next_step: 'Export Evidence Bank dan Readiness Snapshot sebagai lampiran kerja peneliti.',
    },
  ];

  const score = Math.round([
    coverageRates.rm2_student_completion,
    coverageRates.rm3_student_completion,
    coverageRates.evidence_coding,
    coverageRates.evidence_session_binding,
    coverageRates.stage_coverage,
    coverageRates.observed_week_coverage,
  ].reduce((sum, value) => sum + value, 0) / 6);

  const priorityActions = [
    ...checklist.filter((item) => item.status === 'blocked').map((item) => item.next_step),
    ...checklist.filter((item) => item.status === 'partial').map((item) => item.next_step),
  ].filter(unique).slice(0, 6);

  return {
    status: score >= 80 ? 'ready' : score >= 45 ? 'partial' : 'blocked',
    score,
    observed_weeks: observedWeeks,
    target_weeks: 4,
    week_buckets: weekBuckets,
    collection_start: input.collectionStart?.toISOString() ?? null,
    collection_end: input.collectionEnd?.toISOString() ?? null,
    pipeline_counts: pipelineCounts,
    coverage_rates: coverageRates,
    latest_auto_coding_run: latestRun,
    checklist,
    priority_actions: priorityActions,
    thesis_outputs: thesisOutputs,
  };
}

function buildBlockers(input: {
  rawLogs: number;
  weeks: number;
  validSessions: number;
  classifications: number;
  scoredUnits: number;
  codedEvidence: number;
  artifacts: number;
  triangulation: number;
  profileCount: number;
  indicatorCoverage: number;
}): string[] {
  const blockers: string[] = [];
  if (input.rawLogs === 0) blockers.push('Belum ada log prompt dan jawaban AI sebagai data mentah RM2.');
  if (input.weeks < 2) blockers.push('Jejak longitudinal belum cukup terlihat; idealnya terkelompok minimal dua minggu.');
  if (input.validSessions === 0) blockers.push('Belum ada sesi belajar yang dinyatakan valid untuk analisis.');
  if (input.classifications === 0) blockers.push('Belum ada coding tahap prompt SCP/SRP/MQP/Reflektif untuk RM2.');
  if (input.scoredUnits === 0) blockers.push('Belum ada skor 12 indikator CT dan Critical Thinking untuk RM3.');
  if (input.scoredUnits > 0 && input.indicatorCoverage < 12) blockers.push(`Cakupan 12 indikator RM3 belum lengkap; baru ${input.indicatorCoverage}/12 indikator tercatat atau ditandai belum muncul.`);
  if (input.codedEvidence === 0) blockers.push('Belum ada evidence item yang sudah dicoding atau direview.');
  if (input.artifacts === 0) blockers.push('Artefak solusi belum tersimpan sebagai bukti pendukung.');
  if (input.triangulation === 0) blockers.push('Belum ada catatan triangulasi kuat/sebagian/bertentangan.');
  if (input.profileCount === 0) blockers.push('Profil belajar belum tersedia untuk konteks partisipan.');
  return blockers;
}

function buildNextSteps(blockers: string[]): string[] {
  if (blockers.length === 0) return ['Gunakan data ini untuk ekspor RM2/RM3 dan lampiran tesis.'];
  return blockers.map((blocker) => {
    if (blocker.includes('log prompt')) return 'Pastikan siswa melakukan pembelajaran dan log prompt-jawaban AI tersimpan.';
    if (blocker.includes('longitudinal')) return 'Lanjutkan pengambilan data hingga jejak mingguan lebih stabil.';
    if (blocker.includes('valid untuk analisis')) return 'Tinjau sesi belajar dan tandai sesi yang layak dipakai sebagai bahan analisis.';
    if (blocker.includes('coding tahap prompt')) return 'Jalankan klasifikasi otomatis/manual untuk tahap prompt RM2.';
    if (blocker.includes('Cakupan 12 indikator')) return 'Generate triangulasi agar indikator yang belum muncul tetap tercatat sebagai temuan penting.';
    if (blocker.includes('12 indikator')) return 'Jalankan auto scoring atau coding indikator kognitif RM3.';
    if (blocker.includes('evidence item')) return 'Gunakan Evidence Bank untuk memberi coding dan validitas pada bukti mentah.';
    if (blocker.includes('Artefak')) return 'Unggah atau simpan artefak solusi yang terkait dengan sesi belajar.';
    if (blocker.includes('triangulasi')) return 'Buat catatan triangulasi dari log, artefak, jurnal/refleksi, atau diskusi.';
    return 'Lengkapi konteks partisipan di data admin.';
  });
}

function countEvidenceSource(rows: CountedRow[], sourceType: string): number {
  return rows.filter((row) => row.source_type === sourceType).length;
}

function buildIndicatorCoverage(
  manualRows: CountedRow[],
  autoRows: CountedRow[],
  triangulationRows: CountedRow[],
) {
  const covered = new Set<string>();

  [...manualRows, ...autoRows].forEach((row) => {
    INDICATOR_KEYS.forEach((key) => {
      const score = Number(row[key]);
      if (Number.isFinite(score) && score > 0) covered.add(key);
    });
  });

  triangulationRows.forEach((row) => {
    const code = normalizeIndicatorCode(row.indicator_code);
    if (code) covered.add(code);
  });

  const coveredIndicators = INDICATOR_KEYS.filter((key) => covered.has(key));
  const missingIndicators = INDICATOR_KEYS.filter((key) => !covered.has(key));

  return {
    covered_count: coveredIndicators.length,
    total: INDICATOR_KEYS.length,
    covered_indicators: coveredIndicators,
    missing_indicators: missingIndicators,
  };
}

function countTriangulationStatuses(rows: CountedRow[]): Record<string, number> {
  return rows.reduce((acc, row) => {
    const status = String(row.triangulation_status ?? row.convergence_status ?? 'unknown').toLowerCase();
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function normalizeIndicatorCode(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  const direct = INDICATOR_KEYS.find((key) => key.toLowerCase() === raw);
  if (direct) return direct;
  const withoutPrefix = raw.replace(/^rm3[_:-]/, '');
  return INDICATOR_KEYS.find((key) => key.toLowerCase() === withoutPrefix) ?? null;
}

function getCollectionStart(rows: CountedRow[]): Date | null {
  return getBoundaryDate(rows, 'min');
}

function getCollectionEnd(rows: CountedRow[]): Date | null {
  return getBoundaryDate(rows, 'max');
}

function getBoundaryDate(rows: CountedRow[], direction: 'min' | 'max'): Date | null {
  const dates = rows
    .map((row) => parseDate(row.created_at ?? row.session_date))
    .filter((date): date is Date => Boolean(date));

  if (dates.length === 0) return null;
  const sorted = dates.sort((a, b) => a.getTime() - b.getTime());
  return direction === 'min' ? sorted[0] : sorted[sorted.length - 1];
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function makeCheck(input: {
  id: string;
  label: string;
  rm_focus: FieldReadinessCheck['rm_focus'];
  value: number;
  partialAt: number;
  readyAt: number;
  metric: string;
  blockedDetail: string;
  partialDetail: string;
  readyDetail: string;
  nextStep: string;
}): FieldReadinessCheck {
  const status = input.value >= input.readyAt ? 'ready' : input.value >= input.partialAt ? 'partial' : 'blocked';
  return {
    id: input.id,
    label: input.label,
    rm_focus: input.rm_focus,
    status,
    metric: input.metric,
    detail: status === 'ready' ? input.readyDetail : status === 'partial' ? input.partialDetail : input.blockedDetail,
    next_step: input.nextStep,
  };
}

function ratio(value: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, (value / total) * 100)));
}

function statusFromRatio(value: number): FieldCheckStatus {
  if (value >= 80) return 'ready';
  if (value >= 35) return 'partial';
  return 'blocked';
}

function sortWeekBucket(a: string, b: string): number {
  return weekNumber(a) - weekNumber(b);
}

function weekNumber(value: string): number {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 999;
}

function unique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
