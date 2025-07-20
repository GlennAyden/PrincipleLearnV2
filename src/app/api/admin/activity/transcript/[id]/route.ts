import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  context: { params: any }
) {
  try {
    // Ensure params is awaited before accessing its properties
    const id = context.params.id

    // Fetch transcript by ID
    const transcript = await prisma.transcriptQna.findUnique({
      where: { id },
      select: {
        id: true,
        question: true,
        answer: true,
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

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      )
    }

    // Format the response
    const response = {
      id: transcript.id,
      question: transcript.question,
      answer: transcript.answer,
      courseId: transcript.courseId,
      subtopic: transcript.subtopic,
      createdAt: transcript.createdAt.toISOString(),
      userEmail: transcript.user.email
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript details' },
      { status: 500 }
    );
  }
} 