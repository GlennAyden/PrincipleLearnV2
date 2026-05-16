-- MVR Item 8c: anonymisasi peserta riset + jejak consent.
-- Applied via Supabase migration `mvr_w11_users_participant_code_consent` (version 20260516063047).

ALTER TABLE users
  ADD COLUMN participant_code VARCHAR(20),
  ADD COLUMN consent_given_at TIMESTAMPTZ,
  ADD COLUMN consent_version VARCHAR(20);

CREATE UNIQUE INDEX uniq_users_participant_code
  ON users(participant_code) WHERE participant_code IS NOT NULL;
