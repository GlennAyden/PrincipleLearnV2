-- Add UI locale preference to learning_profiles.
-- Notes:
--   * VARCHAR(5) accommodates BCP-47 region tags if we later add e.g. 'en-US'.
--   * CHECK constraint enforces only currently supported locales.
--   * DEFAULT 'id' preserves backward-compatibility for existing rows.
--   * Content stored in other tables (courses, subtopics, quiz) is NOT
--     migrated — those stay in their original generation language.

ALTER TABLE public.learning_profiles
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5)
    NOT NULL DEFAULT 'id'
    CHECK (preferred_language IN ('id', 'en'));

COMMENT ON COLUMN public.learning_profiles.preferred_language IS
  'UI locale preference (id | en). Content generated in DB stays in original language.';
