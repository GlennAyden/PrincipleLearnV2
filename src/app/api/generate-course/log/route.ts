import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * DEPRECATED: This endpoint is no longer needed.
 * Course generation activity is now logged directly in the main
 * POST /api/generate-course route via the `course_generation_activity` table.
 * 
 * This endpoint is kept for backward compatibility but does NOT persist data.
 * It will be removed in a future version.
 */

// Add CORS headers — restrict to same origin (no wildcard)
const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    
    // Validate basic fields for backward compatibility
    if (!data.userId || !data.courseName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Activity is already logged by the main generate-course route.
    // This endpoint returns success for backward compatibility.
    console.log('[Generate Course Log] DEPRECATED: Log request received but not persisted (already logged by main route)');
    
    return NextResponse.json({ 
      success: true, 
      id: `deprecated-${Date.now()}`,
      message: 'Activity is logged by the main generate-course endpoint'
    }, { headers: corsHeaders });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to process log request';
    console.error('[Generate Course Log] Error:', errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}
