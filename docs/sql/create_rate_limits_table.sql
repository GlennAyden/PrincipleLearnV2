-- Rate Limits table for persistent, distributed rate limiting
-- Used by src/lib/rate-limit.ts (Supabase-backed RateLimiter)

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  reset_at TIMESTAMPTZ NOT NULL
);

-- Index for cleanup queries (expired entries)
CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits (reset_at);

-- Auto-cleanup: delete expired entries every hour via pg_cron (optional)
-- If pg_cron is enabled on your Supabase project, uncomment:
-- SELECT cron.schedule('cleanup-rate-limits', '0 * * * *', $$
--   DELETE FROM rate_limits WHERE reset_at < NOW();
-- $$);
