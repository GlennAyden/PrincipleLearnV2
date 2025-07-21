-- Create subtopic cache table for performance optimization
CREATE TABLE IF NOT EXISTS subtopic_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_subtopic_cache_key ON subtopic_cache(cache_key);

-- Add index for cleanup (optional)
CREATE INDEX IF NOT EXISTS idx_subtopic_cache_created ON subtopic_cache(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE subtopic_cache ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (since it's just cache)
CREATE POLICY "Allow all operations on subtopic_cache" ON subtopic_cache
FOR ALL TO authenticated, anon
USING (true)
WITH CHECK (true);

-- Optional: Add automatic cleanup for old cache entries (older than 30 days)
-- You can run this manually or set up as a cron job
-- DELETE FROM subtopic_cache WHERE created_at < NOW() - INTERVAL '30 days';