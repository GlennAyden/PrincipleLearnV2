'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

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
  subtopics: LearningProgressSubtopic[]
  discussion: LearningProgressDiscussion
}

export interface LearningProgressStatus {
  success?: boolean
  courseId: string
  nextHref: string | null
  nextRequired: {
    type: 'subtopic' | 'discussion'
    moduleIndex: number
    subtopicIndex: number
    title: string
    href: string
    reason: string
  } | null
  modules: LearningProgressModule[]
}

export function useLearningProgress(courseId?: string) {
  const [progress, setProgress] = useState<LearningProgressStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => {
    setVersion((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadProgress() {
      if (!courseId) {
        setProgress(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const response = await apiFetch(`/api/learning-progress?courseId=${encodeURIComponent(courseId)}`)
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}))
          throw new Error(
            typeof detail?.error === 'string'
              ? detail.error
              : 'Gagal memuat progres belajar',
          )
        }
        const data = await response.json()
        if (!cancelled) {
          setProgress(data as LearningProgressStatus)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Gagal memuat progres belajar')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadProgress()

    return () => {
      cancelled = true
    }
  }, [courseId, version])

  return { progress, loading, error, refresh }
}

