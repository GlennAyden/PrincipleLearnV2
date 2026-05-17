// src/app/api/admin/perbandingan-mode/route.ts
// Live stats untuk halaman comparison split-screen Mode Umum vs Penelitian.
// Query parallel: courses + distinct users per mode, tidak difilter oleh
// admin_mode cookie — selalu query keduanya sekaligus untuk keperluan demo.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDb } from '@/lib/database'
import { withApiLogging } from '@/lib/api-logger'

export interface ModeStats {
  courses: number
  activeStudents: number
}

export interface PerbandinganModeStatsResponse {
  general: ModeStats
  research: ModeStats
  materialChunks: number
  interactiveBlocksLeaves: number
  researchArtifacts: number
}

// Filter JS-side: hanya leaf_subtopics mode=research dengan blocks non-empty
type InteractiveRow = {
  id: string
  interactive_blocks: unknown
  subtopics: { courses: { mode: string } }
}

async function handler(_req: NextRequest): Promise<NextResponse> {
  try {
    // Query 1: course counts per mode
    const [generalCoursesRes, researchCoursesRes] = await Promise.all([
      adminDb.from('courses').select('id', { count: 'exact', head: true }).eq('mode', 'general'),
      adminDb.from('courses').select('id', { count: 'exact', head: true }).eq('mode', 'research'),
    ])

    const generalCourses = generalCoursesRes.count ?? 0
    const researchCourses = researchCoursesRes.count ?? 0

    // Query 2: distinct users per mode via learning_sessions
    const [generalUsersRes, researchUsersRes] = await Promise.all([
      adminDb.from('learning_sessions').select('user_id').eq('mode', 'general'),
      adminDb.from('learning_sessions').select('user_id').eq('mode', 'research'),
    ])

    const generalStudents = new Set(
      (generalUsersRes.data ?? []).map((r: { user_id: string }) => r.user_id),
    ).size

    const researchStudents = new Set(
      (researchUsersRes.data ?? []).map((r: { user_id: string }) => r.user_id),
    ).size

    // Query 3: material_chunks count (bank sumber untuk Mode Penelitian)
    const materialChunksRes = await adminDb
      .from('material_chunks')
      .select('id', { count: 'exact', head: true })

    const materialChunks = materialChunksRes.count ?? 0

    // Query 4: leaf_subtopics yang punya interactive_blocks (non-null, non-empty)
    // JOIN ke courses via subtopics untuk filter mode=research
    const interactiveRes = await adminDb
      .from('leaf_subtopics')
      .select('id, interactive_blocks, subtopics!inner(courses!inner(mode))')
      .not('interactive_blocks', 'is', 'null')

    const interactiveBlocksLeaves = (
      (interactiveRes.data ?? []) as InteractiveRow[]
    ).filter((row) => {
      const courses = row.subtopics?.courses
      if (!courses || courses.mode !== 'research') return false
      const blocks = row.interactive_blocks
      return Array.isArray(blocks) && blocks.length > 0
    }).length

    // Query 5: research_artifacts count
    const artifactsRes = await adminDb
      .from('research_artifacts')
      .select('id', { count: 'exact', head: true })

    const researchArtifacts = artifactsRes.count ?? 0

    const payload: PerbandinganModeStatsResponse = {
      general: { courses: generalCourses, activeStudents: generalStudents },
      research: { courses: researchCourses, activeStudents: researchStudents },
      materialChunks,
      interactiveBlocksLeaves,
      researchArtifacts,
    }

    return NextResponse.json(payload)
  } catch (err) {
    console.error('[perbandingan-mode/stats] Error:', err)
    return NextResponse.json(
      { error: 'Gagal mengambil statistik perbandingan mode' },
      { status: 500 },
    )
  }
}

export const GET = withApiLogging(handler)
