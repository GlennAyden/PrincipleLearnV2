import { NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database'

interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = params.id;
    console.log(`[Admin Delete User] Attempting to delete user: ${userId}`);
    
    // Get user from database
    let users: User[] = [];
    try {
      users = await DatabaseService.getRecords<User>('users', {
        filter: { id: userId },
        limit: 1
      });
    } catch (dbError) {
      console.error('[Admin Delete User] Database error getting user:', dbError);
      return NextResponse.json(
        { error: 'Database connection error' },
        { status: 500 }
      );
    }
    
    if (users.length === 0) {
      console.log(`[Admin Delete User] User not found: ${userId}`);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }
    
    const user = users[0];
    console.log(`[Admin Delete User] Found user: ${user.email}, Role: ${user.role}`);
    
    // Check if user is an admin
    if (user.role.toLowerCase() === 'admin') {
      console.log(`[Admin Delete User] Cannot delete admin user: ${user.email}`);
      return NextResponse.json(
        { error: "Cannot delete admin users" },
        { status: 403 }
      );
    }
    
    // Delete user and all associated data (CASCADE delete should handle this)
    console.log(`[Admin Delete User] Deleting user ${userId} and all associated data`);
    
    try {
      // Delete the user (CASCADE should delete associated records automatically)
      await DatabaseService.deleteRecord('users', userId);
      
      console.log(`[Admin Delete User] Successfully deleted user: ${user.email}`);
      
      return NextResponse.json({ 
        success: true,
        message: `User ${user.email} and all associated data successfully deleted`
      });
      
    } catch (deleteError) {
      console.error('[Admin Delete User] Error deleting user:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete user from database' },
        { status: 500 }
      );
    }
    
  } catch (error: any) {
    console.error('[Admin Delete User] Error in DELETE endpoint:', error);
    return NextResponse.json(
      { error: error.message || "Failed to delete user" },
      { status: 500 }
    );
  }
}