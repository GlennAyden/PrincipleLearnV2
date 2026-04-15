import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { DatabaseService, adminDb } from '@/lib/database';
import {
  verifyToken,
  generateAccessToken,
  generateAdminAccessToken,
  generateRefreshToken,
} from '@/lib/jwt';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  name?: string | null;
  refresh_token_hash?: string | null;
}

// Lazily-computed valid bcrypt hash used by verifyPasswordConstantTime() to
// keep login timings consistent when no user is found (blunts user-enumeration
// via response time). Generated once at first use so we're guaranteed a
// well-formed bcrypt string even if library defaults change.
let dummyBcryptHash: string | null = null;
async function getDummyBcryptHash(): Promise<string> {
  if (!dummyBcryptHash) {
    dummyBcryptHash = await bcrypt.hash('dummy-password-for-timing-shield', 10);
  }
  return dummyBcryptHash;
}

/**
 * Extract the authenticated user from the access_token cookie.
 * Shared by any route that needs cookie-based auth without middleware.
 */
export async function getCurrentUser(): Promise<UserRecord | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload?.userId) return null;

    const users = await DatabaseService.getRecords<UserRecord>('users', {
      filter: { id: payload.userId as string },
      limit: 1,
    });

    return users.length > 0 ? users[0] : null;
  } catch {
    return null;
  }
}

/**
 * Find a user by ID or email (tries ID first, then email).
 * Shared by quiz/submit, generate-course, and any route accepting flexible user identifiers.
 */
export async function resolveUserByIdentifier(
  identifier: string
): Promise<{ id: string; email: string } | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const byId = await DatabaseService.getRecords<{ id: string; email: string }>('users', {
    filter: { id: trimmed },
    limit: 1,
  });
  if (byId.length > 0) return byId[0];

  const byEmail = await DatabaseService.getRecords<{ id: string; email: string }>('users', {
    filter: { email: trimmed },
    limit: 1,
  });
  return byEmail[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const users = await DatabaseService.getRecords<UserRecord>('users', {
    filter: { email: normalizedEmail },
    limit: 1,
  });
  return users.length > 0 ? users[0] : null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  const users = await DatabaseService.getRecords<UserRecord>('users', {
    filter: { id },
    limit: 1,
  });
  return users.length > 0 ? users[0] : null;
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/**
 * Run a bcrypt compare against a dummy hash so the caller spends the same
 * time as a real comparison. Used on the "user not found" branch of login
 * routes to resist user-enumeration via response-time analysis.
 */
export async function runDummyPasswordCompare(): Promise<void> {
  try {
    const hash = await getDummyBcryptHash();
    await bcrypt.compare('dummy-plaintext-input', hash);
  } catch {
    // Swallow — this path is only about burning CPU cycles, not signalling.
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function generateAuthTokens(user: { id: string; email: string; role: string }) {
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = generateRefreshToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  return { accessToken, refreshToken };
}

/**
 * Same shape as generateAuthTokens but uses the admin-specific access-token
 * expiry (30m). Refresh tokens currently stay on the 7-day lifetime because
 * admin sessions still use the standard refresh flow.
 */
export function generateAdminAuthTokens(user: { id: string; email: string; role: string }) {
  const accessToken = generateAdminAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  const refreshToken = generateRefreshToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  return { accessToken, refreshToken };
}

/**
 * Deterministic SHA-256 digest of a refresh token. Stored in
 * users.refresh_token_hash so we can verify a presented refresh token still
 * matches the one most recently issued to the user (invalidating older tokens
 * and preventing rotation-race replay).
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Persist the hash of the currently-valid refresh token on the user row.
 * Pass null to clear it (e.g. on logout or revocation).
 */
export async function updateUserRefreshTokenHash(
  userId: string,
  hash: string | null,
): Promise<void> {
  const { error } = await adminDb
    .from('users')
    .eq('id', userId)
    .update({ refresh_token_hash: hash });
  if (error) {
    // Non-fatal: log and continue. We still want to issue the new token.
    console.warn('[auth] Failed to persist refresh_token_hash:', error);
  }
}
