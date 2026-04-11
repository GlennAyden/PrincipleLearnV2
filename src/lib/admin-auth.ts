// src/lib/admin-auth.ts
// Shared admin authentication utility — extracted from duplicated code across admin API routes

import type { NextRequest } from 'next/server';
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
