// principle-learn/src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation

export async function GET() {
  try {
    // Mock user data with activity counts
    const mockUsers = [
      {
        id: 'user-123',
        email: 'user@example.com',
        role: 'USER',
        createdAt: new Date('2024-01-15').toISOString(),
        totalGenerate: 5,
        totalTranscripts: 12,
        totalQuizzes: 8,
        totalJournals: 3,
        totalSoalOtomatis: 2,
        lastActivity: '2025-01-15'
      },
      {
        id: 'admin-456',
        email: 'admin@example.com',
        role: 'ADMIN',
        createdAt: new Date('2023-12-01').toISOString(),
        totalGenerate: 15,
        totalTranscripts: 25,
        totalQuizzes: 20,
        totalJournals: 10,
        totalSoalOtomatis: 8,
        lastActivity: '2025-01-20'
      },
      {
        id: 'user-789',
        email: 'test@example.com',
        role: 'USER',
        createdAt: new Date('2024-02-10').toISOString(),
        totalGenerate: 2,
        totalTranscripts: 4,
        totalQuizzes: 3,
        totalJournals: 1,
        totalSoalOtomatis: 0,
        lastActivity: '2025-01-10'
      }
    ];

    return NextResponse.json(mockUsers)
  } catch (err: any) {
    console.error('Error di /api/admin/users', err)
    return NextResponse.json(
      { message: err.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
