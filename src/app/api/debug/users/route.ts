import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

/**
 * Debug routes are dual-gated:
 *   1. Must be running outside production, OR `ENABLE_DEBUG_ROUTES=1`
 *      must be explicitly set in the environment.
 *   2. The calling JWT (propagated via middleware as `x-user-role`) must
 *      have the admin role. This prevents any authenticated non-admin
 *      user from probing the debug surface.
 *
 * Either condition failing returns a 404 (not 403) so the route does not
 * leak its own existence to unauthorised callers.
 */
function guardDebugRoute(req: NextRequest) {
  const envAllowed =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_ROUTES === '1';
  if (!envAllowed) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }
  const role = (req.headers.get('x-user-role') ?? '').toLowerCase();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const blocked = guardDebugRoute(req);
  if (blocked) return blocked;

  try {
    console.log('Debug: Testing users table access');
    
    // Test basic query
    const users = await DatabaseService.getRecords<{ id: string; email: string; role: string }>('users', {
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

export async function POST(req: NextRequest) {
  const blocked = guardDebugRoute(req);
  if (blocked) return blocked;

  try {
    console.log('Debug: Testing user creation');
    
    // Test user creation with minimal data
    const testUser = {
      email: `test-${Date.now()}@example.com`,
      password_hash: '$2a$10$test',
      role: 'user'
    };
    
    const newUser = await DatabaseService.insertRecord<{ id: string; email: string; role: string }>('users', testUser);

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