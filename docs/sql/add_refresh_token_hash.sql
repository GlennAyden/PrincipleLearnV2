-- docs/sql/add_refresh_token_hash.sql
--
-- Adds a column to store the SHA-256 hash of the most recently issued
-- refresh token for each user. Used by /api/auth/refresh to detect refresh
-- token rotation races: if a presented refresh token doesn't match the
-- stored hash, the session is treated as revoked even if the JWT signature
-- is still valid.
--
-- Safe to re-run (IF NOT EXISTS). Apply manually in Supabase SQL editor
-- before deploying the auth-hardening patch — /api/auth/refresh tolerates
-- users with a NULL hash as "legacy session" and will backfill on the
-- next successful rotation.
--
-- Assumes the `users` table already exists and has an `updated_at` column;
-- no trigger changes required because updates go through the existing
-- adminDb query builder which already sets updated_at.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;
