import { DatabaseService } from '@/lib/database';

export interface CourseRecord {
  id: string;
  title: string;
  description: string;
  subject: string;
  difficulty_level: string;
  created_by: string;
  created_at: string;
}

export interface SubtopicRecord {
  id: string;
  course_id: string;
  title: string;
  content: string;
  order_index: number;
}

export async function listUserCourses(userId: string) {
  const courses = await DatabaseService.getRecords<CourseRecord>('courses', {
    filter: { created_by: userId },
    orderBy: { column: 'created_at', ascending: false },
  });

  return courses.map(course => ({
    id: course.id,
    title: course.title,
    level: course.difficulty_level || 'Beginner',
  }));
}

export async function getCourseById(courseId: string): Promise<CourseRecord | null> {
  const courses = await DatabaseService.getRecords<CourseRecord>('courses', {
    filter: { id: courseId },
    limit: 1,
  });
  return courses.length > 0 ? courses[0] : null;
}

export async function getCourseWithSubtopics(courseId: string) {
  const course = await getCourseById(courseId);
  if (!course) return null;

  const subtopics = await DatabaseService.getRecords<SubtopicRecord>('subtopics', {
    filter: { course_id: courseId },
    orderBy: { column: 'order_index', ascending: true },
  });

  return { ...course, subtopics };
}

export async function deleteCourse(courseId: string, userId?: string, userRole?: string): Promise<void> {
  if (userId) {
    const course = await getCourseById(courseId);
    if (!course) return; // already deleted or never existed
    if (!canAccessCourse(course, userId, userRole)) {
      throw new Error('Unauthorized: you do not own this course');
    }
  }
  await DatabaseService.deleteRecord('courses', courseId);
}

/**
 * Check if a user can access a course (owner or admin).
 */
export function canAccessCourse(
  course: { created_by: string },
  userId: string,
  userRole?: string
): boolean {
  return course.created_by === userId || userRole?.toLowerCase() === 'admin';
}

/**
 * Create a course with its module subtopics in a single operation.
 * Used by generate-course to persist AI-generated outlines.
 */
export interface CourseModuleInput {
  module?: string;
  [key: string]: unknown;
}

export async function createCourseWithSubtopics(
  data: {
    title: string;
    description: string;
    subject: string;
    difficulty_level: string;
    estimated_duration: number;
  },
  userId: string,
  modules: CourseModuleInput[]
) {
  const course = (await DatabaseService.insertRecord('courses', {
    ...data,
    created_by: userId,
  })) as unknown as { id: string };

  // Transactional subtopic insert: if ANY subtopic fails, roll back by
  // deleting the parent course so we never leave orphaned course rows.
  // Supabase JS has no multi-statement transactions from the client, so
  // we compensate manually via DatabaseService.deleteRecord.
  try {
    for (let i = 0; i < modules.length; i++) {
      await DatabaseService.insertRecord('subtopics', {
        course_id: course.id,
        title: modules[i].module || `Module ${i + 1}`,
        content: JSON.stringify(modules[i]),
        order_index: i,
      });
    }
  } catch (err) {
    console.error(
      `[CourseService] Subtopic insert failed for course ${course.id}, rolling back:`,
      err,
    );
    try {
      await DatabaseService.deleteRecord('courses', course.id);
      console.log(`[CourseService] Rolled back course ${course.id} after subtopic failure`);
    } catch (rollbackErr) {
      console.error(
        `[CourseService] CRITICAL: rollback failed for course ${course.id}:`,
        rollbackErr,
      );
    }
    throw new Error(
      `Failed to create course subtopics: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return course;
}
