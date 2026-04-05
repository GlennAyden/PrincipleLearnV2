import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { DatabaseService } from '@/lib/database';
import { verifyToken, generateAccessToken, generateRefreshToken } from '@/lib/jwt';

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  name?: string | null;
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
