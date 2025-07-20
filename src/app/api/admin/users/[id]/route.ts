import { NextRequest, NextResponse } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    
    // Mock user data for validation
    const mockUsers = {
      'user-123': { id: 'user-123', email: 'user@example.com', role: 'USER' },
      'admin-456': { id: 'admin-456', email: 'admin@example.com', role: 'ADMIN' },
      'user-789': { id: 'user-789', email: 'test@example.com', role: 'USER' }
    };
    
    const user = mockUsers[userId as keyof typeof mockUsers];
    
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    // Check if user is an admin
    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: "Cannot delete admin users" },
        { status: 403 }
      );
    }
    
    // Mock deletion process
    console.log(`Mock deletion of user ${userId} and all associated data`);
    
    return NextResponse.json({ 
      success: true,
      message: `User ${user.email} and all associated data successfully deleted`
    });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}
