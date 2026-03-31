-- Migration: Add missing fields to learning_sessions table
-- These fields are used by the admin research sessions frontend
-- Date: 2026-03-27

ALTER TABLE learning_sessions
ADD COLUMN IF NOT EXISTS topic_focus TEXT,
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'active';

COMMENT ON COLUMN learning_sessions.topic_focus IS 'Topik fokus sesi pembelajaran';
COMMENT ON COLUMN learning_sessions.duration_minutes IS 'Durasi sesi dalam menit';
COMMENT ON COLUMN learning_sessions.status IS 'Status sesi: active, completed, paused';
