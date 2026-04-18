-- docs/sql/create_leaf_subtopics_and_atomic_quiz_attempts.sql
--
-- Native leaf-subtopic identity plus atomic quiz attempt insertion.
--
-- The legacy `subtopics` table stores module rows, so quiz scoping previously
-- depended on (module subtopic_id + subtopic_label). This migration adds a
-- native per-leaf table and keeps the legacy columns as compatibility
-- fallbacks while the application transitions.

CREATE TABLE IF NOT EXISTS public.leaf_subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.subtopics(id) ON DELETE CASCADE,
  module_title text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  module_index integer,
  subtopic_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT leaf_subtopics_title_not_blank_chk CHECK (btrim(title) <> ''),
  CONSTRAINT leaf_subtopics_normalized_title_not_blank_chk CHECK (btrim(normalized_title) <> ''),
  CONSTRAINT leaf_subtopics_module_index_nonnegative_chk CHECK (module_index IS NULL OR module_index >= 0),
  CONSTRAINT leaf_subtopics_subtopic_index_nonnegative_chk CHECK (subtopic_index IS NULL OR subtopic_index >= 0)
);

ALTER TABLE public.leaf_subtopics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'leaf_subtopics'
      AND policyname = 'leaf_subtopics_service_role_all'
  ) THEN
    CREATE POLICY leaf_subtopics_service_role_all
      ON public.leaf_subtopics
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS leaf_subtopics_course_module_title_key
  ON public.leaf_subtopics (course_id, module_id, normalized_title);

CREATE INDEX IF NOT EXISTS idx_leaf_subtopics_course_module
  ON public.leaf_subtopics (course_id, module_id, subtopic_index);

CREATE OR REPLACE FUNCTION public.normalize_leaf_subtopic_title(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.ensure_leaf_subtopic(
  p_course_id uuid,
  p_module_id uuid,
  p_module_title text,
  p_subtopic_title text,
  p_module_index integer DEFAULT NULL,
  p_subtopic_index integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_leaf_id uuid;
  v_normalized_title text := public.normalize_leaf_subtopic_title(p_subtopic_title);
BEGIN
  IF p_course_id IS NULL OR p_module_id IS NULL OR v_normalized_title = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.leaf_subtopics (
    course_id,
    module_id,
    module_title,
    title,
    normalized_title,
    module_index,
    subtopic_index,
    updated_at
  )
  VALUES (
    p_course_id,
    p_module_id,
    COALESCE(NULLIF(btrim(p_module_title), ''), 'Untitled Module'),
    btrim(p_subtopic_title),
    v_normalized_title,
    p_module_index,
    p_subtopic_index,
    now()
  )
  ON CONFLICT (course_id, module_id, normalized_title)
  DO UPDATE SET
    module_title = EXCLUDED.module_title,
    title = EXCLUDED.title,
    module_index = COALESCE(EXCLUDED.module_index, public.leaf_subtopics.module_index),
    subtopic_index = COALESCE(EXCLUDED.subtopic_index, public.leaf_subtopics.subtopic_index),
    updated_at = now()
  RETURNING id INTO v_leaf_id;

  RETURN v_leaf_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_leaf_subtopic(uuid, uuid, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_leaf_subtopic(uuid, uuid, text, text, integer, integer) TO service_role;

ALTER TABLE IF EXISTS public.quiz
  ADD COLUMN IF NOT EXISTS leaf_subtopic_id uuid REFERENCES public.leaf_subtopics(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.quiz_submissions
  ADD COLUMN IF NOT EXISTS leaf_subtopic_id uuid REFERENCES public.leaf_subtopics(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.user_progress
  ADD COLUMN IF NOT EXISTS leaf_subtopic_id uuid REFERENCES public.leaf_subtopics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quiz_leaf_subtopic_created_at
  ON public.quiz (leaf_subtopic_id, created_at);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_leaf_user_created_at
  ON public.quiz_submissions (user_id, leaf_subtopic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_progress_leaf_subtopic
  ON public.user_progress (user_id, course_id, leaf_subtopic_id);

WITH parsed_modules AS (
  SELECT
    s.id AS module_id,
    s.course_id,
    s.title AS stored_module_title,
    s.order_index AS module_index,
    CASE
      WHEN jsonb_typeof(s.content) = 'string' THEN (s.content #>> '{}')::jsonb
      ELSE s.content
    END AS content
  FROM public.subtopics s
  WHERE s.content IS NOT NULL
),
leaf_items AS (
  SELECT
    pm.course_id,
    pm.module_id,
    COALESCE(NULLIF(pm.content->>'module', ''), pm.stored_module_title) AS module_title,
    pm.module_index,
    (item.ordinality::integer - 1) AS subtopic_index,
    CASE
      WHEN jsonb_typeof(item.value) = 'string' THEN item.value #>> '{}'
      ELSE item.value->>'title'
    END AS subtopic_title
  FROM parsed_modules pm
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(pm.content->'subtopics', '[]'::jsonb)) WITH ORDINALITY AS item(value, ordinality)
),
inserted_leafs AS (
  INSERT INTO public.leaf_subtopics (
    course_id,
    module_id,
    module_title,
    title,
    normalized_title,
    module_index,
    subtopic_index,
    updated_at
  )
  SELECT
    course_id,
    module_id,
    module_title,
    btrim(subtopic_title),
    public.normalize_leaf_subtopic_title(subtopic_title),
    module_index,
    subtopic_index,
    now()
  FROM leaf_items
  WHERE public.normalize_leaf_subtopic_title(subtopic_title) <> ''
  ON CONFLICT (course_id, module_id, normalized_title)
  DO UPDATE SET
    module_title = EXCLUDED.module_title,
    title = EXCLUDED.title,
    module_index = COALESCE(EXCLUDED.module_index, public.leaf_subtopics.module_index),
    subtopic_index = COALESCE(EXCLUDED.subtopic_index, public.leaf_subtopics.subtopic_index),
    updated_at = now()
  RETURNING id
)
SELECT count(*) FROM inserted_leafs;

UPDATE public.quiz q
SET leaf_subtopic_id = ls.id
FROM public.leaf_subtopics ls
WHERE q.leaf_subtopic_id IS NULL
  AND q.course_id = ls.course_id
  AND q.subtopic_id = ls.module_id
  AND public.normalize_leaf_subtopic_title(q.subtopic_label) = ls.normalized_title;

UPDATE public.quiz_submissions qs
SET leaf_subtopic_id = ls.id
FROM public.leaf_subtopics ls
WHERE qs.leaf_subtopic_id IS NULL
  AND qs.course_id = ls.course_id
  AND qs.subtopic_id = ls.module_id
  AND public.normalize_leaf_subtopic_title(qs.subtopic_label) = ls.normalized_title;

WITH single_leaf_modules AS (
  SELECT
    course_id,
    module_id,
    (array_agg(id))[1] AS leaf_subtopic_id
  FROM public.leaf_subtopics
  GROUP BY course_id, module_id
  HAVING count(*) = 1
)
UPDATE public.user_progress up
SET leaf_subtopic_id = slm.leaf_subtopic_id
FROM single_leaf_modules slm
WHERE up.leaf_subtopic_id IS NULL
  AND up.course_id = slm.course_id
  AND up.subtopic_id = slm.module_id;

CREATE OR REPLACE FUNCTION public.insert_quiz_attempt(
  p_user_id uuid,
  p_course_id uuid,
  p_subtopic_id uuid,
  p_subtopic_label text,
  p_leaf_subtopic_id uuid,
  p_module_index integer,
  p_subtopic_index integer,
  p_quiz_attempt_id uuid,
  p_answers jsonb
)
RETURNS TABLE (
  submission_id uuid,
  attempt_number integer,
  quiz_attempt_id uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_attempt_number integer;
  v_quiz_attempt_id uuid := COALESCE(p_quiz_attempt_id, gen_random_uuid());
  v_lock_key bigint;
  v_label text := NULLIF(btrim(COALESCE(p_subtopic_label, '')), '');
BEGIN
  IF p_user_id IS NULL OR p_course_id IS NULL THEN
    RAISE EXCEPTION 'user_id and course_id are required';
  END IF;

  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) = 0 THEN
    RAISE EXCEPTION 'answers must be a non-empty JSON array';
  END IF;

  v_lock_key := hashtextextended(
    concat_ws(
      '|',
      p_user_id::text,
      p_course_id::text,
      COALESCE(p_leaf_subtopic_id::text, ''),
      COALESCE(p_subtopic_id::text, ''),
      COALESCE(v_label, '')
    ),
    0
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(qs.attempt_number), 0) + 1
  INTO v_attempt_number
  FROM public.quiz_submissions qs
  WHERE qs.user_id = p_user_id
    AND qs.course_id = p_course_id
    AND (
      (p_leaf_subtopic_id IS NOT NULL AND qs.leaf_subtopic_id = p_leaf_subtopic_id)
      OR (
        p_leaf_subtopic_id IS NULL
        AND qs.subtopic_id IS NOT DISTINCT FROM p_subtopic_id
        AND NULLIF(btrim(COALESCE(qs.subtopic_label, '')), '') IS NOT DISTINCT FROM v_label
      )
    );

  RETURN QUERY
  INSERT INTO public.quiz_submissions (
    user_id,
    quiz_id,
    course_id,
    subtopic_id,
    subtopic_label,
    leaf_subtopic_id,
    module_index,
    subtopic_index,
    answer,
    is_correct,
    reasoning_note,
    attempt_number,
    quiz_attempt_id
  )
  SELECT
    p_user_id,
    payload.quiz_id,
    p_course_id,
    p_subtopic_id,
    v_label,
    p_leaf_subtopic_id,
    p_module_index,
    p_subtopic_index,
    payload.answer,
    payload.is_correct,
    NULLIF(payload.reasoning_note, ''),
    v_attempt_number,
    v_quiz_attempt_id
  FROM jsonb_to_recordset(p_answers) AS payload(
    quiz_id uuid,
    answer text,
    is_correct boolean,
    reasoning_note text
  )
  RETURNING id, public.quiz_submissions.attempt_number, public.quiz_submissions.quiz_attempt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_quiz_attempt(uuid, uuid, uuid, text, uuid, integer, integer, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_quiz_attempt(uuid, uuid, uuid, text, uuid, integer, integer, uuid, jsonb) TO service_role;
;
