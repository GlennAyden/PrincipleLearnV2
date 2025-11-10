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
  await DatabaseService.insertRecord('feedback', {
    user_id: userId,
    course_id: courseId,
    rating: 5,
    comment:
      'Materi terstruktur dan diskusi socratic membantu saya mengevaluasi pemahaman. Mohon tambahkan lebih banyak studi kasus.',
  });
}
