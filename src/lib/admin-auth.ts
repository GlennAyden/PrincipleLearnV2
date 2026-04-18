// src/lib/admin-auth.ts
// Shared admin authentication utility — extracted from duplicated code across admin API routes

import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface AdminPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Verify that the request comes from an authenticated admin user.
 * Reads the JWT from the `access_token` cookie and checks `role === 'admin'`.
 * Returns the decoded payload or null if unauthorized.
 */
export function verifyAdminFromCookie(request: NextRequest): AdminPayload | null {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AdminPayload;
    if (payload.role?.toLowerCase() !== 'admin') return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyCsrfToken(request: NextRequest): NextResponse | null {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return null;
  }

  const csrfCookie = request.cookies.get('csrf_token')?.value;
  const csrfHeader = request.headers.get('x-csrf-token');

  if (!csrfCookie || !csrfHeader) {
    return NextResponse.json(
      { error: 'CSRF token missing' },
      { status: 403 },
    );
  }

  if (csrfCookie !== csrfHeader) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 },
    );
  }

  return null;
}

export function requireAdminMutation(request: NextRequest): NextResponse | null {
  if (!verifyAdminFromCookie(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return verifyCsrfToken(request);
}
