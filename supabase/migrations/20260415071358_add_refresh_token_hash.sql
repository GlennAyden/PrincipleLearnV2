ALTER TABLE users
  ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;;
