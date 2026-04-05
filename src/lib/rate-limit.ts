// src/lib/rate-limit.ts
// Persistent rate limiter backed by Supabase.
// Falls back to in-memory when Supabase is unavailable (e.g. during tests).

import { adminDb } from './database';

interface RateLimitOptions {
  /** Time window in milliseconds */
  interval: number;
  /** Maximum number of requests allowed in the time window */
  maxRequests: number;
  /** Identifier for this limiter (used as prefix in DB) */
  name: string;
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

/**
 * Rate limiter with Supabase persistence.
 *
 * Uses the `rate_limits` table (key TEXT PK, count INT, reset_at TIMESTAMPTZ).
 * If the table doesn't exist or the DB call fails, transparently falls back
 * to an in-memory Map so the app never crashes due to rate-limit infrastructure.
 */
class RateLimiter {
  private name: string;
  private interval: number;
  private maxRequests: number;

  // In-memory fallback
  private memoryStore: Map<string, RequestRecord> = new Map();
  private useMemoryFallback = false;

  constructor(options: RateLimitOptions) {
    this.name = options.name;
    this.interval = options.interval;
    this.maxRequests = options.maxRequests;

    // Periodic cleanup for the in-memory fallback
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanupMemory(), 60_000);
    }
  }

  /**
   * Check if a request is allowed.
   * @param key Identifier (e.g. IP address or user ID)
   */
  async isAllowed(key: string): Promise<boolean> {
    if (this.useMemoryFallback) {
      return this.isAllowedMemory(key);
    }

    try {
      return await this.isAllowedDb(key);
    } catch (err) {
      // If DB fails (table missing, connection error), fall back to memory
      console.warn(`[RateLimiter:${this.name}] DB unavailable, using in-memory fallback:`, (err as Error).message);
      this.useMemoryFallback = true;
      return this.isAllowedMemory(key);
    }
  }

  // ── Supabase-backed implementation ──────────────────────────────────────

  private async isAllowedDb(key: string): Promise<boolean> {
    const dbKey = `${this.name}:${key}`;
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.interval);

    // Try to read existing record
    const { data: existing } = await adminDb
      .from('rate_limits')
      .select('count, reset_at')
      .eq('key', dbKey)
      .maybeSingle();

    // No record or window expired → create/reset
    if (!existing || new Date(existing.reset_at) <= now) {
      await adminDb.from('rate_limits').upsert(
        { key: dbKey, count: 1, reset_at: resetAt.toISOString() },
        { onConflict: 'key' }
      );
      return true;
    }

    // Within window and under limit → increment
    if (existing.count < this.maxRequests) {
      await adminDb
        .from('rate_limits')
        .eq('key', dbKey)
        .update({ count: existing.count + 1 });
      return true;
    }

    // Over limit
    return false;
  }

  // ── In-memory fallback (same logic as before) ──────────────────────────

  private isAllowedMemory(key: string): boolean {
    const compositeKey = `${this.name}:${key}`;
    const now = Date.now();
    const record = this.memoryStore.get(compositeKey);

    if (!record || now > record.resetTime) {
      this.memoryStore.set(compositeKey, { count: 1, resetTime: now + this.interval });
      return true;
    }

    if (record.count < this.maxRequests) {
      record.count++;
      return true;
    }

    return false;
  }

  private cleanupMemory() {
    const now = Date.now();
    for (const [key, record] of this.memoryStore.entries()) {
      if (now > record.resetTime) {
        this.memoryStore.delete(key);
      }
    }
  }
}

// ── Singleton instances ──────────────────────────────────────────────────

/** Login: 5 attempts per 15 minutes */
const loginRateLimiter = new RateLimiter({
  name: 'login',
  interval: 15 * 60 * 1000,
  maxRequests: 5,
});

/** Registration: 3 attempts per hour */
const registerRateLimiter = new RateLimiter({
  name: 'register',
  interval: 60 * 60 * 1000,
  maxRequests: 3,
});

/** Password reset: 3 attempts per hour */
const resetPasswordRateLimiter = new RateLimiter({
  name: 'reset_password',
  interval: 60 * 60 * 1000,
  maxRequests: 3,
});

/** Password change: 5 attempts per 15 minutes */
const changePasswordRateLimiter = new RateLimiter({
  name: 'change_password',
  interval: 15 * 60 * 1000,
  maxRequests: 5,
});

/** AI endpoints: 30 requests per hour per user */
const aiRateLimiter = new RateLimiter({
  name: 'ai',
  interval: 60 * 60 * 1000,
  maxRequests: 30,
});

export {
  loginRateLimiter,
  registerRateLimiter,
  resetPasswordRateLimiter,
  changePasswordRateLimiter,
  aiRateLimiter,
};
