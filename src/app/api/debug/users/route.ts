import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function GET() {
  try {
    console.log('Debug: Testing users table access');
    
    // Test basic query
    const users = await DatabaseService.getRecords('users', {
      limit: 5
    });
    
    console.log('Debug: Found users:', users);
    
    return NextResponse.json({
      success: true,
      message: 'Users table accessible',
      userCount: users.length,
      users: users.map(u => ({ id: u.id, email: u.email, role: u.role }))
    });
  } catch (error) {
    console.error('Debug: Error accessing users table:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}

export async function POST() {
  try {
    console.log('Debug: Testing user creation');
    
    // Test user creation with minimal data
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password_hash: '$2a$10$test',
      role: 'user'
    };
    
    const newUser = await DatabaseService.insertRecord('users', testUser);
    
    console.log('Debug: User created:', newUser);
    
    return NextResponse.json({
      success: true,
      message: 'Test user created successfully',
      user: { id: newUser.id, email: newUser.email, role: newUser.role }
    });
  } catch (error) {
    console.error('Debug: Error creating test user:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}