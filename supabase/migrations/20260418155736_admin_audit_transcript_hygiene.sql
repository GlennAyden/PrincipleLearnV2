-- ============================================================
-- Admin audit: transcript referential hygiene
-- ============================================================
-- This migration is intentionally non-destructive:
-- - existing orphan transcript rows are copied into a quarantine table
-- - FK constraints are added NOT VALID so old orphans do not block deploys
-- - each FK is validated only when the current data is already clean
-- - no transcript rows are deleted or mutated
-- ============================================================

CREATE TABLE IF NOT EXISTS public.transcript_integrity_quarantine (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL DEFAULT 'transcript',
  source_id UUID NOT NULL,
  quarantine_reason TEXT[] NOT NULL,
  row_data JSONB NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transcript_integrity_quarantine_source_unique UNIQUE (source_table, source_id),
  CONSTRAINT transcript_integrity_quarantine_reason_nonempty CHECK (array_length(quarantine_reason, 1) > 0)
);

CREATE INDEX IF NOT EXISTS idx_transcript_integrity_quarantine_detected
  ON public.transcript_integrity_quarantine (detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcript_integrity_quarantine_unresolved
  ON public.transcript_integrity_quarantine (detected_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE public.transcript_integrity_quarantine ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'transcript_integrity_quarantine'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
      ON public.transcript_integrity_quarantine
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

REVOKE ALL ON public.transcript_integrity_quarantine FROM anon, authenticated;
GRANT ALL ON public.transcript_integrity_quarantine TO service_role;

COMMENT ON TABLE public.transcript_integrity_quarantine IS
  'Non-destructive audit quarantine for transcript rows whose user_id, course_id, or subtopic_id does not currently resolve.';

COMMENT ON COLUMN public.transcript_integrity_quarantine.row_data IS
  'Original transcript row captured as jsonb for cleanup review before any manual data repair.';

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND to_regclass('public.courses') IS NOT NULL
     AND to_regclass('public.subtopics') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name IN ('id', 'user_id', 'course_id', 'subtopic_id')
       GROUP BY table_schema, table_name
       HAVING COUNT(*) = 4
     ) THEN
    EXECUTE $sql$
      INSERT INTO public.transcript_integrity_quarantine (
        source_table,
        source_id,
        quarantine_reason,
        row_data,
        detected_at,
        updated_at
      )
      SELECT
        'transcript',
        t.id,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN t.user_id IS NULL THEN 'missing_user_id' END,
          CASE WHEN t.user_id IS NOT NULL AND u.id IS NULL THEN 'orphan_user_id' END,
          CASE WHEN t.course_id IS NULL THEN 'missing_course_id' END,
          CASE WHEN t.course_id IS NOT NULL AND c.id IS NULL THEN 'orphan_course_id' END,
          CASE WHEN t.subtopic_id IS NOT NULL AND s.id IS NULL THEN 'orphan_subtopic_id' END
        ], NULL),
        to_jsonb(t),
        NOW(),
        NOW()
      FROM public.transcript t
      LEFT JOIN public.users u ON u.id = t.user_id
      LEFT JOIN public.courses c ON c.id = t.course_id
      LEFT JOIN public.subtopics s ON s.id = t.subtopic_id
      WHERE t.user_id IS NULL
         OR u.id IS NULL
         OR t.course_id IS NULL
         OR c.id IS NULL
         OR (t.subtopic_id IS NOT NULL AND s.id IS NULL)
      ON CONFLICT (source_table, source_id) DO UPDATE
      SET
        quarantine_reason = EXCLUDED.quarantine_reason,
        row_data = EXCLUDED.row_data,
        updated_at = NOW()
      WHERE public.transcript_integrity_quarantine.resolved_at IS NULL
         OR public.transcript_integrity_quarantine.row_data IS DISTINCT FROM EXCLUDED.row_data
         OR public.transcript_integrity_quarantine.quarantine_reason IS DISTINCT FROM EXCLUDED.quarantine_reason
    $sql$;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transcript'
        AND column_name = 'user_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_transcript_user_id
        ON public.transcript (user_id);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transcript'
        AND column_name = 'course_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_transcript_course_id
        ON public.transcript (course_id);
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'transcript'
        AND column_name = 'subtopic_id'
    ) THEN
      CREATE INDEX IF NOT EXISTS idx_transcript_subtopic_id
        ON public.transcript (subtopic_id);
    END IF;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_user_id_fkey'
     ) THEN
    ALTER TABLE public.transcript
      ADD CONSTRAINT transcript_user_id_fkey
      FOREIGN KEY (user_id)
      REFERENCES public.users(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_user_id_not_null_check'
     ) THEN
    ALTER TABLE public.transcript
      ADD CONSTRAINT transcript_user_id_not_null_check
      CHECK (user_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name = 'course_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_course_id_not_null_check'
     ) THEN
    ALTER TABLE public.transcript
      ADD CONSTRAINT transcript_course_id_not_null_check
      CHECK (course_id IS NOT NULL)
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.courses') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name = 'course_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_course_id_fkey'
     ) THEN
    ALTER TABLE public.transcript
      ADD CONSTRAINT transcript_course_id_fkey
      FOREIGN KEY (course_id)
      REFERENCES public.courses(id)
      ON DELETE CASCADE
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.subtopics') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name = 'subtopic_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_subtopic_id_fkey'
     ) THEN
    ALTER TABLE public.transcript
      ADD CONSTRAINT transcript_subtopic_id_fkey
      FOREIGN KEY (subtopic_id)
      REFERENCES public.subtopics(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_user_id_not_null_check'
         AND convalidated = false
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.transcript t
       WHERE t.user_id IS NULL
     ) THEN
    ALTER TABLE public.transcript VALIDATE CONSTRAINT transcript_user_id_not_null_check;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_user_id_fkey'
         AND convalidated = false
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.transcript t
       LEFT JOIN public.users u ON u.id = t.user_id
       WHERE t.user_id IS NULL
          OR u.id IS NULL
     ) THEN
    ALTER TABLE public.transcript VALIDATE CONSTRAINT transcript_user_id_fkey;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_course_id_not_null_check'
         AND convalidated = false
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.transcript t
       WHERE t.course_id IS NULL
     ) THEN
    ALTER TABLE public.transcript VALIDATE CONSTRAINT transcript_course_id_not_null_check;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.courses') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_course_id_fkey'
         AND convalidated = false
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.transcript t
       LEFT JOIN public.courses c ON c.id = t.course_id
       WHERE t.course_id IS NULL
          OR c.id IS NULL
     ) THEN
    ALTER TABLE public.transcript VALIDATE CONSTRAINT transcript_course_id_fkey;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.subtopics') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = to_regclass('public.transcript')
         AND conname = 'transcript_subtopic_id_fkey'
         AND convalidated = false
     )
     AND NOT EXISTS (
       SELECT 1
       FROM public.transcript t
       LEFT JOIN public.subtopics s ON s.id = t.subtopic_id
       WHERE t.subtopic_id IS NOT NULL
         AND s.id IS NULL
     ) THEN
    ALTER TABLE public.transcript VALIDATE CONSTRAINT transcript_subtopic_id_fkey;
  END IF;
END
$$;

DO $$
BEGIN
  IF to_regclass('public.transcript') IS NOT NULL
     AND to_regclass('public.users') IS NOT NULL
     AND to_regclass('public.courses') IS NOT NULL
     AND to_regclass('public.subtopics') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'transcript'
         AND column_name IN ('id', 'user_id', 'course_id', 'subtopic_id', 'created_at', 'updated_at')
       GROUP BY table_schema, table_name
       HAVING COUNT(*) = 6
     ) THEN
    EXECUTE $sql$
      CREATE OR REPLACE VIEW public.v_transcript_integrity_audit
      WITH (security_invoker = true)
      AS
      SELECT
        t.id AS transcript_id,
        t.user_id,
        (u.id IS NOT NULL) AS user_exists,
        t.course_id,
        (c.id IS NOT NULL) AS course_exists,
        t.subtopic_id,
        (t.subtopic_id IS NULL OR s.id IS NOT NULL) AS subtopic_exists,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN t.user_id IS NULL THEN 'missing_user_id' END,
          CASE WHEN t.user_id IS NOT NULL AND u.id IS NULL THEN 'orphan_user_id' END,
          CASE WHEN t.course_id IS NULL THEN 'missing_course_id' END,
          CASE WHEN t.course_id IS NOT NULL AND c.id IS NULL THEN 'orphan_course_id' END,
          CASE WHEN t.subtopic_id IS NOT NULL AND s.id IS NULL THEN 'orphan_subtopic_id' END
        ], NULL) AS integrity_findings,
        t.created_at,
        t.updated_at
      FROM public.transcript t
      LEFT JOIN public.users u ON u.id = t.user_id
      LEFT JOIN public.courses c ON c.id = t.course_id
      LEFT JOIN public.subtopics s ON s.id = t.subtopic_id
    $sql$;

    REVOKE ALL ON public.v_transcript_integrity_audit FROM anon, authenticated;
    GRANT SELECT ON public.v_transcript_integrity_audit TO service_role;

    COMMENT ON VIEW public.v_transcript_integrity_audit IS
      'Service-role audit helper for checking transcript FK readiness without deleting or mutating transcript data.';
  END IF;
END
$$;
