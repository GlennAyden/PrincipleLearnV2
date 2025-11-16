import { randomUUID } from 'crypto';
import { DatabaseService } from '@/lib/database';

type DemoEntities = {
  userId: string;
  userEmail: string;
  courseId: string;
  courseTitle: string;
};

const DEMO_EMAIL = 'activity.demo@principlelearn.ai';
const DEMO_COURSE_TITLE = 'Activity Monitoring Demo Course';

async function ensureDemoUser(): Promise<{ userId: string; userEmail: string }> {
  const existing = await DatabaseService.getRecords('users', {
    filter: { email: DEMO_EMAIL },
    limit: 1,
  });

  if (existing.length > 0) {
    return { userId: existing[0].id, userEmail: existing[0].email };
  }

  const user = await DatabaseService.insertRecord('users', {
    email: DEMO_EMAIL,
    password_hash: 'demo-seeded-hash',
    name: 'Activity Demo User',
    role: 'user',
  });

  return { userId: user.id, userEmail: user.email };
}

async function ensureDemoCourse(
  userId: string,
): Promise<{ courseId: string; courseTitle: string }> {
  const existing = await DatabaseService.getRecords('courses', {
    filter: { title: DEMO_COURSE_TITLE },
    limit: 1,
  });

  if (existing.length > 0) {
    return { courseId: existing[0].id, courseTitle: existing[0].title };
  }

  const course = await DatabaseService.insertRecord('courses', {
    title: DEMO_COURSE_TITLE,
    description: 'Sample course to showcase activity monitoring features.',
    subject: 'Learning Science',
    difficulty_level: 'Intermediate',
    created_by: userId,
  });

  return { courseId: course.id, courseTitle: course.title };
}

async function ensureDemoEntities(): Promise<DemoEntities> {
  const { userId, userEmail } = await ensureDemoUser();
  const { courseId, courseTitle } = await ensureDemoCourse(userId);
  return { userId, userEmail, courseId, courseTitle };
}

async function ensureDemoSubtopics(courseId: string) {
  const existing = await DatabaseService.getRecords('subtopics', {
    filter: { course_id: courseId },
    limit: 1,
  });
  if (existing.length > 0) {
    return DatabaseService.getRecords('subtopics', {
      filter: { course_id: courseId },
      orderBy: { column: 'order_index', ascending: true },
    });
  }

  const modules = [
    {
      module: 'Modul 1: Dasar-dasar Berpikir Kritis',
      subtopics: [
        {
          title: '1.1 Mengenali Bias Umum',
          overview: 'Memetakan tipe bias yang sering muncul pada keputusan sehari-hari.',
        },
        {
          title: '1.2 Menyusun Pertanyaan Penjajakan',
          overview: 'Latihan membuat pertanyaan terbuka untuk menggali asumsi awal.',
        },
      ],
    },
    {
      module: 'Modul 2: Teknik Analisis',
      subtopics: [
        {
          title: '2.1 Teknik SCQA',
          overview: 'Menerapkan struktur Situation-Complication-Question-Answer.',
        },
        {
          title: '2.2 Analisis Sebab Akibat',
          overview: 'Menggunakan diagram causal loop untuk menelusuri akar masalah.',
        },
      ],
    },
  ];

  const inserted = [];
  for (let i = 0; i < modules.length; i++) {
    const record = await DatabaseService.insertRecord('subtopics', {
      course_id: courseId,
      title: modules[i].module,
      content: JSON.stringify(modules[i]),
      order_index: i,
    });
    inserted.push(record);
  }
  return inserted;
}

export async function ensureAskQuestionHistorySeeded() {
  const existing = await DatabaseService.getRecords('ask_question_history', {
    limit: 1,
  });
  if (existing.length > 0) return;

  const { userId, courseId } = await ensureDemoEntities();
  await DatabaseService.insertRecord('ask_question_history', {
    user_id: userId,
    course_id: courseId,
    module_index: 0,
    subtopic_index: 0,
    page_number: 0,
    subtopic_label: 'Pendahuluan: Konsep Dasar',
    question: 'Apa perbedaan utama antara data kuantitatif dan kualitatif?',
    answer:
      'Data kuantitatif berbentuk angka dan diukur secara objektif, sedangkan data kualitatif berbentuk narasi/deskripsi yang menangkap konteks dan makna.',
  });
}

export async function ensureChallengeResponsesSeeded() {
  const existing = await DatabaseService.getRecords('challenge_responses', {
    limit: 1,
  });
  if (existing.length > 0) return;

  const { userId, courseId } = await ensureDemoEntities();
  await DatabaseService.insertRecord('challenge_responses', {
    id: randomUUID(),
    user_id: userId,
    course_id: courseId,
    module_index: 1,
    subtopic_index: 2,
    page_number: 0,
    question:
      'Bagaimana Anda akan menerapkan metode Feynman Technique untuk menjelaskan konsep bias kognitif kepada tim Anda?',
    answer:
      'Saya akan memecah bias kognitif menjadi definisi sederhana, mencontohkan situasi nyata di tim, lalu meminta rekan kerja menjelaskan ulang untuk memastikan pemahaman.',
    feedback:
      'Pendekatan Anda sudah tepat karena menekankan simplifikasi dan contoh kontekstual. Tambahkan sesi refleksi singkat agar tim menyadari bias yang pernah terjadi.',
  });
}

export async function ensureFeedbackSeeded() {
  const existing = await DatabaseService.getRecords('feedback', {
    limit: 1,
  });
  if (existing.length > 0) return;

  const { userId, courseId } = await ensureDemoEntities();
  const subtopics = await ensureDemoSubtopics(courseId);
  await DatabaseService.insertRecord('feedback', {
    user_id: userId,
    course_id: courseId,
    subtopic_id: subtopics[0]?.id ?? null,
    module_index: 0,
    subtopic_index: 0,
    subtopic_label: subtopics[0]?.title ?? 'Pendahuluan',
    rating: 5,
    comment:
      'Materi terstruktur dan diskusi socratic membantu saya mengevaluasi pemahaman. Mohon tambahkan lebih banyak studi kasus.',
  });
}

export async function ensureCourseGenerationActivitySeeded() {
  const existing = await DatabaseService.getRecords('course_generation_activity', {
    limit: 1,
  });
  if (existing.length > 0) return;

  const { userId, courseId } = await ensureDemoEntities();
  const outlineModules = await ensureDemoSubtopics(courseId);
  const outline = outlineModules.map((module, idx) => ({
    module: module.title || `Modul ${idx + 1}`,
    subtopics: (() => {
      try {
        const parsed = JSON.parse(module.content ?? '[]');
        return Array.isArray(parsed.subtopics) ? parsed.subtopics : [];
      } catch {
        return [];
      }
    })(),
  }));

  await DatabaseService.insertRecord('course_generation_activity', {
    user_id: userId,
    course_id: courseId,
    request_payload: {
      step1: { topic: 'Berpikir Kritis', goal: 'Mengambil keputusan lebih jernih' },
      step2: { level: 'Intermediate', extraTopics: 'Teknik SCQA, Root Cause Analysis' },
      step3: {
        problem: 'Tim sering melewatkan akar masalah dan langsung ke solusi.',
        assumption: 'Berpikir kritis hanya soal logika',
      },
    },
    outline,
  });
}

export async function ensureQuizSeeded() {
  const existing = await DatabaseService.getRecords('quiz_submissions', {
    limit: 1,
  });
  if (existing.length > 0) return;

  const { userId, courseId } = await ensureDemoEntities();
  const subtopics = await ensureDemoSubtopics(courseId);
  const targetSubtopic = subtopics[0];

  const quiz = await DatabaseService.insertRecord('quiz', {
    course_id: courseId,
    subtopic_id: targetSubtopic?.id ?? null,
    question: 'Langkah pertama yang tepat untuk menghindari bias konfirmasi adalah?',
    options: ['Langsung mencari data pendukung', 'Mencari sudut pandang berlawanan', 'Mengikuti pendapat mayoritas', 'Menunda keputusan tanpa batas'],
    correct_answer: 'B',
    explanation: 'Bias konfirmasi dikurangi dengan sengaja mengecek bukti berlawanan.',
  });

  await DatabaseService.insertRecord('quiz_submissions', {
    user_id: userId,
    quiz_id: quiz.id,
    answer: 'B',
    is_correct: true,
  });
}

export async function ensureDiscussionSessionSeeded() {
  const existing = await DatabaseService.getRecords('discussion_sessions', {
    limit: 1,
  });
  if (existing.length > 0) return;

  const { userId, courseId } = await ensureDemoEntities();
  const subtopics = await ensureDemoSubtopics(courseId);
  const targetSubtopic = subtopics[0];

  const templatePayload = {
    learning_goals: [
      {
        id: 'goal-1',
        description: 'Mahasiswa mampu mengidentifikasi asumsi tersembunyi.',
        thinkingSkill: { domain: 'critical', indicator: 'Analysis' },
      },
      {
        id: 'goal-2',
        description: 'Mahasiswa mampu menyusun pertanyaan klarifikasi lanjutan.',
        thinkingSkill: { domain: 'critical', indicator: 'Explanation' },
      },
    ],
    phases: [
      {
        id: 'opening',
        steps: [
          {
            key: 'opening-1',
            prompt: 'Bagikan asumsi awalmu tentang situasi ini.',
            expected_type: 'open',
            goal_refs: ['goal-1'],
          },
        ],
      },
      {
        id: 'reflection',
        steps: [
          {
            key: 'reflection-1',
            prompt: 'Pertanyaan klarifikasi apa yang akan kamu ajukan?',
            expected_type: 'open',
            goal_refs: ['goal-2'],
          },
        ],
      },
    ],
  };

  const template = await DatabaseService.insertRecord('discussion_templates', {
    course_id: courseId,
    subtopic_id: targetSubtopic?.id ?? null,
    version: 'v1-demo',
    source: { subtopicTitle: targetSubtopic?.title ?? 'Subtopik Demo' },
    template: templatePayload,
  });

  const session = await DatabaseService.insertRecord('discussion_sessions', {
    user_id: userId,
    course_id: courseId,
    subtopic_id: targetSubtopic?.id ?? null,
    template_id: template.id,
    status: 'completed',
    phase: 'completed',
    learning_goals: templatePayload.learning_goals,
  });

  await DatabaseService.insertRecord('discussion_messages', {
    session_id: session.id,
    role: 'agent',
    content: 'Bagikan asumsi awalmu tentang situasi pengambilan keputusan terakhir.',
    step_key: 'opening-1',
    metadata: { phase: 'opening' },
  });

  await DatabaseService.insertRecord('discussion_messages', {
    session_id: session.id,
    role: 'student',
    content: 'Saya berasumsi data market tahun lalu sudah cukup relevan.',
    step_key: 'opening-1',
    metadata: {
      evaluation: { coveredGoals: ['goal-1'] },
    },
  });

  await DatabaseService.insertRecord('discussion_messages', {
    session_id: session.id,
    role: 'agent',
    content: 'Pertanyaan apa yang bisa memastikan asumsi tersebut valid?',
    step_key: 'reflection-1',
    metadata: { phase: 'reflection' },
  });
}
