// src/lib/rate-limit.ts

interface RateLimitOptions {
  interval: number; // Time window in milliseconds
  maxRequests: number; // Maximum number of requests allowed in the time window
}

interface RequestRecord {
  count: number;
  resetTime: number;
}

// Simple in-memory rate limiter
class RateLimiter {
  private requests: Map<string, RequestRecord>;
  private interval: number;
  private maxRequests: number;

  constructor(options: RateLimitOptions) {
    this.requests = new Map();
    this.interval = options.interval;
    this.maxRequests = options.maxRequests;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if a request is allowed based on the rate limit
   * @param key Identifier for the request (e.g., IP address, user ID)
   * @returns True if the request is allowed, false otherwise
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const record = this.requests.get(key);

    // If no record exists or it has expired, create a new one
    if (!record || now > record.resetTime) {
      this.requests.set(key, {
        count: 1,
        resetTime: now + this.interval
      });
      return true;
    }

    // If the record exists and is within the time window
    if (record.count < this.maxRequests) {
      record.count++;
      return true;
    }

    return false;
  }

  /**
   * Clean up expired entries
   */
  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Create a singleton instance for login attempts
const loginRateLimiter = new RateLimiter({
  interval: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5 // 5 attempts allowed in 15 minutes
});

// Create a singleton instance for registration attempts
const registerRateLimiter = new RateLimiter({
  interval: 60 * 60 * 1000, // 1 hour
  maxRequests: 3 // 3 attempts allowed in 1 hour
});

// Create a singleton instance for password reset attempts
const resetPasswordRateLimiter = new RateLimiter({
  interval: 60 * 60 * 1000, // 1 hour
  maxRequests: 3 // 3 attempts allowed in 1 hour
});

// Create a singleton instance for password change attempts
const changePasswordRateLimiter = new RateLimiter({
  interval: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5 // 5 attempts allowed in 15 minutes
});

export { loginRateLimiter, registerRateLimiter, resetPasswordRateLimiter, changePasswordRateLimiter }; 