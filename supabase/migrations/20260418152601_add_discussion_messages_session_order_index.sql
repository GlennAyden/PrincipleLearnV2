CREATE INDEX IF NOT EXISTS idx_discussion_messages_session_created_id
  ON public.discussion_messages (session_id, created_at, id);
