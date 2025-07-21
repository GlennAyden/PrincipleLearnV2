import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

export async function GET(req: NextRequest) {
  try {
    // Get access token from cookies
    const accessToken = req.cookies.get('access_token')?.value;
    
    // If no token exists, return unauthorized
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    // Verify the token
    const payload = verifyToken(accessToken);
    
    // If token is invalid or expired, return unauthorized
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Get user data from database
    const users = await DatabaseService.getRecords('users', {
      filter: { id: payload.userId },
      limit: 1
    });
    
    // If user doesn't exist in database, return unauthorized
    if (users.length === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }
    
    const user = users[0];
    
    // Return user data without sensitive fields
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name || null
      }
    });
  } catch (error: any) {
    console.error('Get user error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get user data' },
      { status: 500 }
    );
  }
} 