-- MVR Item 8c — assign deterministic participant_code (S001..SNNN) to every
-- user that has at least one research-mode learning session. Order by
-- users.created_at ASC so codes are stable across re-runs.
-- Applied via Supabase migration `mvr_w12_backfill_participant_codes` (version 20260516065518).
--
-- Backfill only — skips users that already have a non-null participant_code,
-- so this is safe to re-execute.

WITH research_participants AS (
  SELECT DISTINCT u.id, u.created_at
  FROM users u
  WHERE u.deleted_at IS NULL
    AND u.participant_code IS NULL
    AND EXISTS (
      SELECT 1 FROM learning_sessions ls
      WHERE ls.user_id = u.id AND ls.mode = 'research'
    )
),
existing_codes AS (
  SELECT count(*) AS used_count FROM users WHERE participant_code IS NOT NULL
),
ranked AS (
  SELECT
    rp.id,
    'S' || LPAD(
      ((SELECT used_count FROM existing_codes) + ROW_NUMBER() OVER (ORDER BY rp.created_at ASC))::text,
      3, '0'
    ) AS new_code
  FROM research_participants rp
)
UPDATE users u
SET participant_code = r.new_code
FROM ranked r
WHERE u.id = r.id;
