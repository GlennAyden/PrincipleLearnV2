import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

// Proxy to secure the existing /api/discussion/module-status for admin use
async function getHandler(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value ?? request.cookies.get('token')?.value;
  const payload = token ? verifyToken(token) : null;
  
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Forward to existing endpoint with admin auth
  const url = new URL(request.url);
  url.pathname = '/api/discussion/module-status';
  const proxyReq = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  // Note: This is a simple proxy. For production, use fetch with streaming if needed.
  const response = await fetch(proxyReq);
  const data = await response.json();

  return NextResponse.json(data, { status: response.status });
}

export const GET = withApiLogging(getHandler, {
  label: 'admin.discussions.module-status-proxy',
});

