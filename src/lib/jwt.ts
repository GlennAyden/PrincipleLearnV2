import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required. Set it in .env.local');
  }
  return secret;
}

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes (regular users)
// Admin harmonized to 30m: longer than user access tokens (admins need continuity
// across dashboard workflows) but far shorter than the previous 2h which widened
// the window for stolen-token replay. Refresh flow still extends the session.
const ADMIN_ACCESS_TOKEN_EXPIRY = '30m';
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

// Access token lifetimes exposed as seconds for cookie maxAge alignment.
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 15 * 60;
export const ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS = 30 * 60;
export const REFRESH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  type?: 'access' | 'refresh';
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, getJwtSecret(), { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate an access token for admin sessions. Uses a 30m expiry (harmonized
 * from the previous 2h) — admins need more continuity than regular users but
 * benefit from a shorter stolen-token replay window than before.
 */
export function generateAdminAccessToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, getJwtSecret(), { expiresIn: ADMIN_ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign({ ...payload, type: 'refresh' }, getJwtSecret(), { expiresIn: REFRESH_TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
    // Reject refresh tokens — accept access or legacy tokens without a type claim
    if (payload.type === 'refresh') {
      console.warn('[JWT] Refresh token rejected by verifyToken()');
      return null;
    }
    return payload;
  } catch (error) {
    const message = (error as Error).message || 'Unknown verification error';
    console.warn(`[JWT] Token verification failed: ${message}`);
    return null;
  }
}

export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as TokenPayload;
    // Reject access tokens — accept refresh or legacy tokens without a type claim
    if (payload.type === 'access') {
      console.warn('[JWT] Access token rejected by verifyRefreshToken()');
      return null;
    }
    return payload;
  } catch (error) {
    const message = (error as Error).message || 'Unknown verification error';
    console.warn(`[JWT] Refresh token verification failed: ${message}`);
    return null;
  }
}

export function getTokenExpiration(token: string): Date | null {
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded && typeof decoded === 'object' && decoded.payload && typeof decoded.payload === 'object') {
      const exp = (decoded.payload as Record<string, unknown>).exp as number | undefined;
      if (exp) {
        return new Date(exp * 1000);
      }
    }
    return null;
  } catch {
    return null;
  }
} 