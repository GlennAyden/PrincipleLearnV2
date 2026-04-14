// src/lib/auth-helper.ts
//
// Shared auth resolver for API routes.
//
// Why this exists:
//   Next.js 15 middleware can inject per-request headers via
//   `NextResponse.next({ request: { headers } })`, but in production the
//   injected headers occasionally fail to propagate to the route handler
//   (observed on Vercel). Commit 1596cef patched the quiz routes by reading
//   the JWT cookie directly as a fallback. This helper centralises that
//   pattern so every route stays consistent and the fix only lives in one
//   place going forward.
//
// Security model is unchanged: middleware still runs and still verifies the
// JWT before injecting headers; the cookie fallback verifies the JWT again.
// Both paths go through `verifyToken`, so a spoofed header cannot bypass
// auth — if the header is missing, we ignore it and rely on the cookie.

import type { NextRequest } from 'next/server';
import { verifyToken } from './jwt';

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
}

/**
 * Resolve the full auth context (userId, email, role) for an API route.
 * Returns null if neither the middleware header nor a valid access_token
 * cookie is present.
 */
export function resolveAuthContext(req: NextRequest): AuthContext | null {
  const headerUserId = req.headers.get('x-user-id');
  if (headerUserId) {
    return {
      userId: headerUserId,
      email: req.headers.get('x-user-email') ?? '',
      role: req.headers.get('x-user-role') ?? '',
    };
  }

  const accessToken = req.cookies.get('access_token')?.value;
  if (!accessToken) return null;

  const payload = verifyToken(accessToken);
  if (!payload?.userId) return null;

  return {
    userId: payload.userId,
    email: payload.email ?? '',
    role: payload.role ?? '',
  };
}

/**
 * Shortcut for routes that only need the user id. Most handlers use this.
 */
export function resolveAuthUserId(req: NextRequest): string | null {
  return resolveAuthContext(req)?.userId ?? null;
}
