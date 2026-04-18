import { adminDb } from '@/lib/database'
import { evaluateModuleDiscussionPrerequisites } from '@/lib/discussion-prerequisites'
import { getCourseWithSubtopics, type SubtopicRecord } from '@/services/course.service'
import type { ModulePrerequisiteDetails, ModulePrerequisiteItem } from '@/types/discussion'

interface SubtopicNode {
  title?: string
  type?: string
  isDiscussion?: boolean
  overview?: string
}

interface ModuleContent {
  module?: string
  subtopics?: Array<string | SubtopicNode>
}

interface DiscussionSessionRow {
  subtopic_id: string | null
  status: string | null
  phase: string | null
  created_at: string | null
}

interface UserProgressRow {
  subtopic_id: string | null
  leaf_subtopic_id?: string | null
  is_completed: boolean | null
  completed_at: string | null
}

export interface LearningProgressSubtopic {
  moduleIndex: number
  subtopicIndex: number
  title: string
  href: string
  unlocked: boolean
  generated: boolean
  quizCompleted: boolean
  reflectionCompleted: boolean
  completed: boolean
  status: 'locked' | 'available' | 'generated' | 'quiz_completed' | 'completed'
  missing: string[]
  reason: string | null
}

export interface LearningProgressDiscussion {
  moduleIndex: number
  subtopicIndex: number
  title: string
  href: string
  unlocked: boolean
  ready: boolean
  completed: boolean
  status: 'locked' | 'ready' | 'in_progress' | 'completed'
  reason: string | null
}

export interface LearningProgressModule {
  moduleIndex: number
  moduleId: string
  title: string
  href: string
  unlocked: boolean
  ready: boolean
  completed: boolean
  summary: ModulePrerequisiteDetails['summary']
  subtopics: LearningProgressSubtopic[]
  discussion: LearningProgressDiscussion
}

export interface LearningProgressNextRequirement {
  type: 'subtopic' | 'discussion'
  moduleIndex: number
  subtopicIndex: number
  title: string
  href: string
  reason: string
}

export interface LearningProgressStatus {
  courseId: string
  nextHref: string | null
  nextRequired: LearningProgressNextRequirement | null
  modules: LearningProgressModule[]
}

function normalizeString(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function isDiscussionNode(node: string | SubtopicNode | null | undefined): boolean {
  if (!node) return false
  if (typeof node === 'string') {
    const normalized = normalizeString(node)
    return normalized.includes('diskusi penutup') || normalized.includes('closing discussion')
  }

  const title = typeof node.title === 'string' ? node.title : ''
  return (
    node.type === 'discussion' ||
    node.isDiscussion === true ||
    normalizeString(title).includes('diskusi penutup') ||
    normalizeString(title).includes('closing discussion')
  )
}

function parseModuleContent(row: SubtopicRecord, index: number): ModuleContent {
  try {
    const parsed = row.content ? JSON.parse(String(row.content)) : null
    if (parsed && typeof parsed === 'object') {
      return parsed as ModuleContent
    }
  } catch (error) {
    console.warn('[LearningProgress] Failed to parse module content', { index, error })
  }

  return { module: row.title || `Module ${index + 1}`, subtopics: [] }
}

function buildSubtopicHref(courseId: string, moduleIndex: number, subtopicIndex: number) {
  return `/course/${courseId}/subtopic/${moduleIndex}/0?module=${moduleIndex}&subIdx=${subtopicIndex}`
}

function buildDiscussionHref(params: {
  courseId: string
  moduleIndex: number
  subtopicIndex: number
  moduleId: string
  moduleTitle: string
}) {
  const query = new URLSearchParams({
    module: String(params.moduleIndex),
    subIdx: String(params.subtopicIndex),
    scope: 'module',
    moduleId: params.moduleId,
    title: params.moduleTitle,
  })
  return `/course/${params.courseId}/discussion/${params.moduleIndex}?${query.toString()}`
}

function missingForSubtopic(item: ModulePrerequisiteItem) {
  const missing: string[] = []
  if (!item.generated) missing.push('materi')
  if (!item.quizCompleted) missing.push('kuis')
  if (!item.reflectionCompleted) missing.push('refleksi')
  return missing
}

function statusForSubtopic(
  unlocked: boolean,
  item: ModulePrerequisiteItem,
): LearningProgressSubtopic['status'] {
  if (!unlocked) return 'locked'
  if (item.completed) return 'completed'
  if (item.quizCompleted) return 'quiz_completed'
  if (item.generated) return 'generated'
  return 'available'
}

function reasonForSubtopic(unlocked: boolean, item: ModulePrerequisiteItem, moduleUnlocked: boolean) {
  if (!unlocked) {
    return moduleUnlocked
      ? 'Selesaikan subtopik sebelumnya terlebih dahulu.'
      : 'Modul sebelumnya perlu diselesaikan terlebih dahulu.'
  }

  const missing = missingForSubtopic(item)
  if (!missing.length) return null
  if (missing.includes('materi')) return 'Buka dan generate materi terlebih dahulu.'
  if (missing.includes('kuis')) return 'Selesaikan kuis terlebih dahulu.'
  return 'Harap mengisi feedback dulu sebelum melanjutkan.'
}

async function fetchDiscussionCompletion(userId: string, courseId: string, moduleIds: string[]) {
  const sessionMap = new Map<string, DiscussionSessionRow>()
  const progressMap = new Map<string, UserProgressRow>()

  if (moduleIds.length === 0) {
    return { sessionMap, progressMap }
  }

  const { data: sessions, error: sessionError } = await adminDb
    .from('discussion_sessions')
    .select('subtopic_id, status, phase, created_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .in('subtopic_id', moduleIds)
    .order('created_at', { ascending: false })

  if (sessionError) {
    console.warn('[LearningProgress] Failed to load discussion sessions', sessionError)
  } else {
    ((sessions ?? []) as DiscussionSessionRow[]).forEach((session) => {
      if (session.subtopic_id && !sessionMap.has(session.subtopic_id)) {
        sessionMap.set(session.subtopic_id, session)
      }
    })
  }

  const { data: progressRows, error: progressError } = await adminDb
    .from('user_progress')
    .select('subtopic_id, leaf_subtopic_id, is_completed, completed_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .in('subtopic_id', moduleIds)
    .is('leaf_subtopic_id', null)

  if (progressError) {
    console.warn('[LearningProgress] Failed to load user progress', progressError)
  } else {
    ((progressRows ?? []) as UserProgressRow[]).forEach((row) => {
      if (row.subtopic_id) {
        progressMap.set(row.subtopic_id, row)
      }
    })
  }

  return { sessionMap, progressMap }
}

export async function buildLearningProgressStatus(params: {
  courseId: string
  userId: string
}): Promise<LearningProgressStatus> {
  const { courseId, userId } = params
  const course = await getCourseWithSubtopics(courseId)
  if (!course) {
    throw new Error('Course not found')
  }

  const modules = course.subtopics ?? []
  const moduleIds = modules.map((row) => row.id).filter(Boolean)
  const { sessionMap, progressMap } = await fetchDiscussionCompletion(userId, courseId, moduleIds)

  const builtModules: LearningProgressModule[] = []
  let previousModuleCompleted = true

  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
    const row = modules[moduleIndex]
    const parsed = parseModuleContent(row, moduleIndex)
    const moduleTitle = parsed.module || row.title || `Module ${moduleIndex + 1}`
    const rawSubtopics = Array.isArray(parsed.subtopics) ? parsed.subtopics : []
    const discussionIndex = rawSubtopics.findIndex((node) => isDiscussionNode(node))
    const discussionSubtopicIndex = discussionIndex >= 0 ? discussionIndex : rawSubtopics.length
    const moduleUnlocked = moduleIndex === 0 ? true : previousModuleCompleted
    const prerequisites = await evaluateModuleDiscussionPrerequisites({
      courseId,
      moduleId: row.id,
      userId,
    })

    let previousSubtopicComplete = true
    const subtopics = prerequisites.subtopics.map((item) => {
      const unlocked = moduleUnlocked && previousSubtopicComplete
      const missing = missingForSubtopic(item)
      const subtopic: LearningProgressSubtopic = {
        moduleIndex,
        subtopicIndex: item.subtopicIndex,
        title: item.title,
        href: buildSubtopicHref(courseId, moduleIndex, item.subtopicIndex),
        unlocked,
        generated: item.generated,
        quizCompleted: item.quizCompleted,
        reflectionCompleted: item.reflectionCompleted,
        completed: item.completed,
        status: statusForSubtopic(unlocked, item),
        missing,
        reason: reasonForSubtopic(unlocked, item, moduleUnlocked),
      }
      previousSubtopicComplete = item.completed
      return subtopic
    })

    const session = sessionMap.get(row.id) ?? null
    const progress = progressMap.get(row.id) ?? null
    const discussionCompleted =
      session?.status === 'completed' || progress?.is_completed === true
    const discussionReady = prerequisites.ready
    const discussionUnlocked = moduleUnlocked && discussionReady
    const discussionStatus: LearningProgressDiscussion['status'] = discussionCompleted
      ? 'completed'
      : !discussionUnlocked
        ? 'locked'
        : session
          ? 'in_progress'
          : 'ready'
    const discussion: LearningProgressDiscussion = {
      moduleIndex,
      subtopicIndex: discussionSubtopicIndex,
      title: 'Diskusi Wajib',
      href: buildDiscussionHref({
        courseId,
        moduleIndex,
        subtopicIndex: discussionSubtopicIndex,
        moduleId: row.id,
        moduleTitle,
      }),
      unlocked: discussionUnlocked,
      ready: discussionReady,
      completed: discussionCompleted,
      status: discussionStatus,
      reason: discussionUnlocked
        ? null
        : 'Selesaikan generate materi, kuis, dan refleksi semua subtopik modul ini terlebih dahulu.',
    }

    const moduleCompleted = prerequisites.ready && discussionCompleted
    builtModules.push({
      moduleIndex,
      moduleId: row.id,
      title: moduleTitle,
      href: `/course/${courseId}?module=${moduleIndex}`,
      unlocked: moduleUnlocked,
      ready: prerequisites.ready,
      completed: moduleCompleted,
      summary: prerequisites.summary,
      subtopics,
      discussion,
    })

    previousModuleCompleted = moduleCompleted
  }

  const nextRequired = findNextRequirement(builtModules)

  return {
    courseId,
    nextHref: nextRequired?.href ?? null,
    nextRequired,
    modules: builtModules,
  }
}

function findNextRequirement(modules: LearningProgressModule[]): LearningProgressNextRequirement | null {
  for (const moduleStatus of modules) {
    const nextSubtopic = moduleStatus.subtopics.find((item) => item.unlocked && !item.completed)
    if (nextSubtopic) {
      return {
        type: 'subtopic',
        moduleIndex: nextSubtopic.moduleIndex,
        subtopicIndex: nextSubtopic.subtopicIndex,
        title: nextSubtopic.title,
        href: nextSubtopic.href,
        reason: nextSubtopic.reason ?? 'Lanjutkan subtopik ini terlebih dahulu.',
      }
    }

    if (moduleStatus.discussion.unlocked && !moduleStatus.discussion.completed) {
      return {
        type: 'discussion',
        moduleIndex: moduleStatus.moduleIndex,
        subtopicIndex: moduleStatus.discussion.subtopicIndex,
        title: moduleStatus.discussion.title,
        href: moduleStatus.discussion.href,
        reason: 'Selesaikan diskusi wajib modul ini terlebih dahulu.',
      }
    }
  }

  return null
}
