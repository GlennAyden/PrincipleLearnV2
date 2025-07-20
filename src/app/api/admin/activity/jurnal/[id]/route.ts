import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    // Ambil id dari URL
    const url = new URL(req.url)
    const id = url.pathname.split('/').pop()

    // Fetch journal entry by ID
    const journal = await prisma.jurnalRefleksi.findUnique({
      where: { id },
      select: {
        id: true,
        content: true,
        courseId: true,
        subtopic: true,
        createdAt: true,
        user: {
          select: {
            email: true
          }
        }
      }
    })

    if (!journal) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      )
    }

    // Format the response
    const response = {
      id: journal.id,
      content: journal.content,
      courseId: journal.courseId,
      subtopic: journal.subtopic,
      createdAt: journal.createdAt.toISOString(),
      userEmail: journal.user.email
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entry details' },
      { status: 500 }
    );
  }
} 