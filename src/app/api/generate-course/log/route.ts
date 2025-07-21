import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';

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

    // Find user in database
    const users = await DatabaseService.getRecords('users', {
      filter: { email: data.userId },
      limit: 1
    });

    if (users.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const user = users[0];

    // Create generate course log in database
    const logData = {
      user_id: user.id,
      course_name: data.courseName,
      parameters: data.parameter || '',
      action_type: 'generate_course'
    };

    // Since we don't have a specific log table, we can create one or skip logging for now
    // For now, just return success without saving log
    const log = {
      id: `course-log-${Date.now()}`,
      userId: data.userId,
      courseName: data.courseName,
      parameter: data.parameter || '',
      createdAt: new Date().toISOString()
    };

    console.log('Generate course log (not saved to DB yet):', log);
    return NextResponse.json({ success: true, id: log.id }, { headers: corsHeaders });
  } catch (error: any) {
    console.error('Error saving generate course log:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save generate course log" },
      { status: 500, headers: corsHeaders }
    );
  }
} 