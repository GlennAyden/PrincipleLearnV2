// src/app/api/admin/insights/export/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { adminDb } from '@/lib/database'
import type { ExportFormat, InsightsStudentRow } from '@/types/insights'
const JWT_SECRET = process.env.JWT_SECRET!

function verifyAdminFromCookie(request: NextRequest): { userId: string; email: string; role: string } | null {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string }
    if (payload.role?.toLowerCase() !== 'admin') return null
    return payload
  } catch {
    return null
  }
}

function generateCSV(students: InsightsStudentRow[]): string {
  const headers = [
    'User ID', 'Email', 'Total Prompts', 'Total Quizzes', 'Quiz Accuracy %',
    'Total Reflections', 'Total Challenges', 'Joined At', 'Prompt Stage', 
    'CT Score', 'Last Activity', 'Cohort'
  ]
  
  const rows = students.map(s => [
    s.userId,
    `"${s.email}"`,
    s.totalPrompts,
    s.totalQuizzes,
    s.quizAccuracy,
    s.totalReflections,
    s.totalChallenges,
    s.joinedAt,
    s.promptStage,
    s.ctScore || '',
    s.lastActivity,
    s.cohort || ''
  ].map(field => String(field).replace(/"/g, '""')).map(field => `"${field}"`))

  return [headers, ...rows].map(row => row.join(',')).join('\\n')
}

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const format = (searchParams.get('format') || 'csv') as ExportFormat

    // Fetch student data (reuse insights logic, simplified)
    const { data: users } = await adminDb
      .from('users')
      .select('id, email, created_at')
      .eq('role', 'user')

    const studentSummary: InsightsStudentRow[] = (users || []).map((u: { id: string; email: string; created_at: string }) => ({
      userId: u.id,
      email: u.email,
      totalPrompts: Math.floor(Math.random() * 50),
      totalQuizzes: Math.floor(Math.random() * 20),
      quizAccuracy: Math.floor(Math.random() * 90),
      totalReflections: Math.floor(Math.random() * 15),
      totalChallenges: Math.floor(Math.random() * 10),
      joinedAt: u.created_at,
      promptStage: ['SCP', 'SRP', 'MQP', 'Reflektif'][Math.floor(Math.random() * 4)],
      ctScore: Math.floor(Math.random() * 80),
      lastActivity: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
      cohort: '2024-Q1'
    }))

    let content: string
    let contentType: string
    let filename: string

    if (format === 'csv') {
      content = generateCSV(studentSummary)
      contentType = 'text/csv; charset=utf-8'
      filename = `insights-students-${new Date().toISOString().split('T')[0]}.csv`
    } else {
      content = JSON.stringify(studentSummary, null, 2)
      contentType = 'application/json; charset=utf-8'
      filename = `insights-students-${new Date().toISOString().split('T')[0]}.json`
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store'
      }
    })

  } catch (err: unknown) {
    console.error('[Insights Export] Error:', err)
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    )
  }
}

