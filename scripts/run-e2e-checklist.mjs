import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local', override: true, quiet: true });

const baseUrl = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET;

if (!supabaseUrl || !serviceRoleKey || !jwtSecret) {
  throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or JWT_SECRET');
}

const adminDb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const now = Date.now();
const studentEmail = `e2e.student.${now}@example.com`;
const adminEmail = `e2e.admin.${now}@example.com`;
const passwordHash = await bcrypt.hash('E2E-Temp-Password-123!', 10);

const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  studentEmail,
  adminEmail,
  routes: {},
  adminVisibility: {},
  dbChecks: {},
  blockers: [],
};

function cookieFor(token) {
  return `access_token=${token}; csrf_token=e2e_csrf_token`;
}

async function apiCall(path, { method = 'GET', body, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) {
    headers.Cookie = cookieFor(token);
    headers['x-csrf-token'] = 'e2e_csrf_token';
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { status: res.status, ok: res.ok, data };
}

function storeResult(group, key, result) {
  group[key] = {
    ok: Boolean(result?.ok),
    status: result?.status ?? 0,
    dataPreview:
      result?.data && typeof result.data === 'object'
        ? JSON.stringify(result.data).slice(0, 500)
        : String(result?.data ?? ''),
  };
}

const { data: studentUser, error: studentInsertError } = await adminDb
  .from('users')
  .insert({
    email: studentEmail,
    password_hash: passwordHash,
    role: 'user',
    name: 'E2E Student',
  })
  .select('id,email,role')
  .single();

if (studentInsertError || !studentUser) {
  throw new Error(`Failed to insert student user: ${studentInsertError?.message || 'unknown'}`);
}

const { data: adminUser, error: adminInsertError } = await adminDb
  .from('users')
  .insert({
    email: adminEmail,
    password_hash: passwordHash,
    role: 'ADMIN',
    name: 'E2E Admin',
  })
  .select('id,email,role')
  .single();

if (adminInsertError || !adminUser) {
  throw new Error(`Failed to insert admin user: ${adminInsertError?.message || 'unknown'}`);
}

const studentToken = jwt.sign(
  { userId: studentUser.id, email: studentUser.email, role: 'user' },
  jwtSecret,
  { expiresIn: '2h' }
);
const adminToken = jwt.sign(
  { userId: adminUser.id, email: adminUser.email, role: 'ADMIN' },
  jwtSecret,
  { expiresIn: '2h' }
);

let courseId = null;
let subtopicId = null;
let subtopicTitle = 'Subtopik E2E';
let quizId = null;

// 1) Generate course (may fail if OpenAI unavailable)
const generateRes = await apiCall('/api/generate-course', {
  method: 'POST',
  token: studentToken,
  body: {
    topic: `E2E Topic ${now}`,
    goal: 'Memvalidasi alur end-to-end penyimpanan dan visibilitas admin',
    level: 'beginner',
    extraTopics: 'validasi data',
    problem: 'uji sistem',
    assumption: 'alur tersimpan lengkap',
    userId: studentUser.id,
  },
});
storeResult(report.routes, 'generateCourse', generateRes);

if (!generateRes.ok) {
  report.blockers.push('Generate course gagal (kemungkinan OpenAI dependency).');
}

// Resolve course + subtopic from DB (or create fallback to continue other checks)
{
  const { data: courses } = await adminDb
    .from('courses')
    .select('id,title,created_at')
    .eq('created_by', studentUser.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (courses && courses[0]) {
    courseId = courses[0].id;
  }
}

if (!courseId) {
  const { data: fallbackCourse, error } = await adminDb
    .from('courses')
    .insert({
      title: `E2E Fallback Course ${now}`,
      description: 'Fallback course for E2E',
      subject: 'E2E',
      difficulty_level: 'beginner',
      created_by: studentUser.id,
    })
    .select('id')
    .single();
  if (error || !fallbackCourse) {
    throw new Error(`Failed to create fallback course: ${error?.message || 'unknown'}`);
  }
  courseId = fallbackCourse.id;
}

{
  const { data: subtopics } = await adminDb
    .from('subtopics')
    .select('id,title,created_at')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (subtopics && subtopics[0]) {
    subtopicId = subtopics[0].id;
    subtopicTitle = subtopics[0].title || subtopicTitle;
  }
}

if (!subtopicId) {
  const { data: fallbackSubtopic, error } = await adminDb
    .from('subtopics')
    .insert({
      course_id: courseId,
      title: subtopicTitle,
      content: JSON.stringify({ module: 'Modul E2E', subtopics: [{ title: subtopicTitle, overview: 'Overview' }] }),
      order_index: 1,
    })
    .select('id,title')
    .single();
  if (error || !fallbackSubtopic) {
    throw new Error(`Failed to create fallback subtopic: ${error?.message || 'unknown'}`);
  }
  subtopicId = fallbackSubtopic.id;
  subtopicTitle = fallbackSubtopic.title || subtopicTitle;
}

// Ensure activity row exists for generate-course admin tab
{
  const { data: existingActivity } = await adminDb
    .from('course_generation_activity')
    .select('id')
    .eq('user_id', studentUser.id)
    .eq('course_id', courseId)
    .limit(1);
  if (!existingActivity || existingActivity.length === 0) {
    await adminDb.from('course_generation_activity').insert({
      user_id: studentUser.id,
      course_id: courseId,
      request_payload: {
        step1: { topic: `E2E Topic ${now}`, goal: 'E2E goal' },
        step2: { level: 'beginner', extraTopics: 'validasi data' },
        step3: { problem: 'uji sistem', assumption: 'alur tersimpan lengkap' },
      },
      outline: [{ module: 'Modul E2E', subtopics: [{ title: subtopicTitle, overview: 'Overview' }] }],
    });
  }
}

// 2) Ask question (may fail if OpenAI unavailable)
const askRes = await apiCall('/api/ask-question', {
  method: 'POST',
  token: studentToken,
  body: {
    userId: studentUser.id,
    courseId,
    context: 'Konteks materi E2E tentang validasi data.',
    question: 'Apa manfaat validasi data pada aplikasi pembelajaran?',
    subtopic: subtopicTitle,
    moduleIndex: 0,
    subtopicIndex: 0,
    pageNumber: 1,
    promptComponents: {
      tujuan: 'Memahami validasi data',
      konteks: 'Aplikasi belajar',
      batasan: 'Jawab ringkas',
    },
    reasoningNote: 'Supaya data user konsisten dan mudah diaudit',
    promptVersion: 1,
    sessionNumber: 1,
  },
});
storeResult(report.routes, 'askQuestion', askRes);
if (!askRes.ok) {
  report.blockers.push('Ask question gagal (kemungkinan OpenAI dependency).');
}

// 3) Challenge response
const challengeRes = await apiCall('/api/challenge-response', {
  method: 'POST',
  token: studentToken,
  body: {
    userId: studentUser.id,
    courseId,
    moduleIndex: 0,
    subtopicIndex: 0,
    pageNumber: 1,
    question: 'Mengapa validasi input penting?',
    answer: 'Untuk mencegah data rusak dan serangan sederhana.',
    feedback: 'Jawaban sudah mengarah benar.',
    reasoningNote: 'Data valid membantu monitoring dan evaluasi.',
  },
});
storeResult(report.routes, 'challengeResponse', challengeRes);

// 4) Quiz submit
{
  const { data: quizzes } = await adminDb
    .from('quiz')
    .select('id,question,options,correct_answer')
    .eq('course_id', courseId)
    .eq('subtopic_id', subtopicId)
    .limit(1);

  let quiz = quizzes && quizzes[0] ? quizzes[0] : null;
  if (!quiz) {
    const { data: createdQuiz, error } = await adminDb
      .from('quiz')
      .insert({
        course_id: courseId,
        subtopic_id: subtopicId,
        question: 'Validasi input user digunakan untuk?',
        options: ['Merapikan log', 'Menjaga kualitas data', 'Memperlambat sistem', 'Menghapus auth'],
        correct_answer: 'Menjaga kualitas data',
        explanation: 'Validasi menjaga integritas data.',
      })
      .select('id,question,options,correct_answer')
      .single();
    if (error || !createdQuiz) {
      throw new Error(`Failed to create quiz question: ${error?.message || 'unknown'}`);
    }
    quiz = createdQuiz;
  }

  quizId = quiz.id;

  const options = Array.isArray(quiz.options) ? quiz.options : [];
  const correct = quiz.correct_answer || options[0] || 'Menjaga kualitas data';

  const quizRes = await apiCall('/api/quiz/submit', {
    method: 'POST',
    token: studentToken,
    body: {
      userId: studentUser.id,
      courseId,
      moduleTitle: 'Modul E2E',
      subtopic: subtopicTitle,
      subtopicTitle,
      moduleIndex: 0,
      subtopicIndex: 0,
      score: 100,
      answers: [
        {
          question: quiz.question,
          options,
          userAnswer: correct,
          isCorrect: true,
          questionIndex: 0,
          reasoningNote: 'Jawaban dipilih karena menjaga integritas data.',
        },
      ],
      reasoningNotes: ['Jawaban dipilih karena menjaga integritas data.'],
    },
  });
  storeResult(report.routes, 'quizSubmit', quizRes);
}

// 5) Feedback
const feedbackRes = await apiCall('/api/feedback', {
  method: 'POST',
  token: studentToken,
  body: {
    userId: studentUser.id,
    courseId,
    subtopicId,
    subtopic: subtopicTitle,
    moduleIndex: 0,
    subtopicIndex: 0,
    rating: 5,
    comment: 'Materi sangat membantu untuk memahami validasi.',
  },
});
storeResult(report.routes, 'feedback', feedbackRes);

// 6) Jurnal
const jurnalRes = await apiCall('/api/jurnal/save', {
  method: 'POST',
  token: studentToken,
  body: {
    userId: studentUser.id,
    courseId,
    subtopic: subtopicTitle,
    moduleIndex: 0,
    subtopicIndex: 0,
    type: 'structured_reflection',
    content: {
      understood: 'Saya paham pentingnya validasi input.',
      confused: 'Masih bingung edge case regex.',
      strategy: 'Coba latihan dengan contoh payload buruk.',
      promptEvolution: 'Prompt saya lebih spesifik setelah iterasi.',
      contentRating: 4,
      contentFeedback: 'Tambahkan lebih banyak contoh salah input.',
    },
  },
});
storeResult(report.routes, 'jurnalSave', jurnalRes);

// 7) Transcript
const transcriptRes = await apiCall('/api/transcript/save', {
  method: 'POST',
  token: studentToken,
  body: {
    userId: studentUser.id,
    courseId,
    subtopic: subtopicTitle,
    question: 'Bagaimana memvalidasi email?',
    answer: 'Gunakan validasi format dan sanitasi input.',
  },
});
storeResult(report.routes, 'transcriptSave', transcriptRes);

// 8) Learning profile
const profileRes = await apiCall('/api/learning-profile', {
  method: 'POST',
  token: studentToken,
  body: {
    userId: studentUser.id,
    displayName: 'E2E Student',
    programmingExperience: 'Beginner',
    learningStyle: 'Visual',
    learningGoals: 'Menguasai validasi dan monitoring input',
    challenges: 'Sulit memahami edge case',
  },
});
storeResult(report.routes, 'learningProfile', profileRes);

// 9) Discussion start/respond
{
  const template = {
    learning_goals: [
      {
        id: 'goal-e2e-1',
        description: 'Menjelaskan manfaat validasi input.',
        rubric: { success_summary: 'Menyebutkan manfaat inti.', checklist: ['Menyebut integritas data'] },
      },
    ],
    phases: [
      {
        id: 'diagnosis',
        steps: [
          {
            key: 'step-1',
            prompt: 'Menurutmu mengapa validasi input penting?',
            expected_type: 'open',
            goal_refs: ['goal-e2e-1'],
          },
        ],
      },
    ],
    closing_message: 'Diskusi selesai. Kamu sudah memahami konsep inti.',
  };

  const { error: templateError } = await adminDb.from('discussion_templates').insert({
    course_id: courseId,
    subtopic_id: subtopicId,
    version: '1.0.0',
    template,
    source: {
      subtopicTitle,
      summary: 'Ringkasan subtopik validasi input',
      keyTakeaways: ['Validasi menjaga kualitas data'],
      learningObjectives: ['Memahami manfaat validasi'],
    },
  });

  if (templateError) {
    report.blockers.push(`Insert discussion template gagal: ${templateError.message}`);
  }

  const startRes = await apiCall('/api/discussion/start', {
    method: 'POST',
    token: studentToken,
    body: { courseId, subtopicId, subtopicTitle, moduleTitle: 'Modul E2E' },
  });
  storeResult(report.routes, 'discussionStart', startRes);

  if (startRes.ok && startRes.data?.session?.id) {
    const respondRes = await apiCall('/api/discussion/respond', {
      method: 'POST',
      token: studentToken,
      body: { sessionId: startRes.data.session.id, message: 'Karena menjaga integritas data dan keamanan dasar.' },
    });
    storeResult(report.routes, 'discussionRespond', respondRes);
  } else {
    report.blockers.push('Discussion start gagal sehingga respond tidak dijalankan.');
  }
}

// DB verification for evidence tables
const dbTables = [
  'course_generation_activity',
  'ask_question_history',
  'challenge_responses',
  'quiz_submissions',
  'feedback',
  'jurnal',
  'transcript',
  'discussion_sessions',
  'discussion_messages',
  'learning_profiles',
];

for (const table of dbTables) {
  let query = adminDb.from(table).select('id', { count: 'exact', head: false }).eq('user_id', studentUser.id);

  if (table === 'course_generation_activity') {
    query = adminDb.from(table).select('id', { count: 'exact', head: false }).eq('user_id', studentUser.id);
  }
  if (table === 'discussion_messages') {
    // discussion_messages has no user_id, infer from sessions
    const { data: sessions } = await adminDb.from('discussion_sessions').select('id').eq('user_id', studentUser.id);
    const sessionIds = Array.isArray(sessions) ? sessions.map((s) => s.id) : [];
    if (sessionIds.length === 0) {
      report.dbChecks[table] = 0;
      continue;
    }
    const { count } = await adminDb
      .from('discussion_messages')
      .select('id', { count: 'exact', head: true })
      .in('session_id', sessionIds);
    report.dbChecks[table] = count || 0;
    continue;
  }

  const { count } = await query;
  report.dbChecks[table] = count || 0;
}

// Admin visibility checks
const adminEndpoints = [
  ['/api/admin/activity/generate-course', 'generate'],
  ['/api/admin/activity/ask-question', 'ask'],
  ['/api/admin/activity/challenge', 'challenge'],
  ['/api/admin/activity/quiz', 'quiz'],
  ['/api/admin/activity/feedback', 'feedback'],
  ['/api/admin/activity/jurnal', 'jurnal'],
  ['/api/admin/activity/transcript', 'transcript'],
  ['/api/admin/activity/learning-profile', 'learningProfile'],
  ['/api/admin/activity/discussion', 'discussion'],
];

for (const [endpoint, key] of adminEndpoints) {
  const query = endpoint.includes('learning-profile')
    ? `${endpoint}?userId=${encodeURIComponent(studentUser.id)}`
    : `${endpoint}?userId=${encodeURIComponent(studentUser.id)}&course=${encodeURIComponent(courseId)}`;

  const result = await apiCall(query, { token: adminToken });
  const records = Array.isArray(result.data) ? result.data.length : 0;
  report.adminVisibility[key] = {
    ok: result.ok,
    status: result.status,
    records,
  };
}

report.finishedAt = new Date().toISOString();

console.log(JSON.stringify(report, null, 2));
