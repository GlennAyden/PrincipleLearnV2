import { NextRequest, NextResponse } from 'next/server';
// import prisma from '@/lib/prisma'; // Removed for mock implementation
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
    
    // Mock user data based on token payload
    const mockUsers = {
      'user-123': {
        id: 'user-123',
        email: 'user@example.com',
        role: 'USER',
        isVerified: true
      },
      'admin-456': {
        id: 'admin-456',
        email: 'admin@example.com',
        role: 'ADMIN',
        isVerified: true
      }
    };
    
    const user = mockUsers[payload.userId as keyof typeof mockUsers];
    
    // If user doesn't exist in mock data, return unauthorized
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }
    
    // Return user data without sensitive fields
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
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