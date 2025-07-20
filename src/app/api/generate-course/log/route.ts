import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

// Add CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

interface GenerateCourseLog {
  userId: string; // Email user
  courseName: string;
  parameter: string;
}

export async function POST(req: NextRequest) {
  try {
    const data: GenerateCourseLog = await req.json();
    
    // Validasi data
    if (!data.userId || !data.courseName) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Mock user validation
    const validEmails = ['user@example.com', 'admin@example.com', 'test@example.com'];

    if (!validEmails.includes(data.userId)) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Mock generate course log creation
    const log = {
      id: `course-log-${Date.now()}`,
      userId: data.userId,
      courseName: data.courseName,
      parameter: data.parameter || '',
      createdAt: new Date().toISOString()
    };

    console.log('Mock generate course log created:', log);
    return NextResponse.json({ success: true, id: log.id }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Error saving generate course log:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save generate course log" },
      { status: 500, headers: corsHeaders }
    );
  }
} 