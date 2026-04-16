-- docs/sql/fix_leaf_subtopic_advisor_findings.sql
--
-- Follow-up for Supabase advisor findings introduced by the leaf-subtopic
-- migration: immutable helper search_path and FK-covering indexes.

CREATE OR REPLACE FUNCTION public.normalize_leaf_subtopic_title(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));
$$;

CREATE INDEX IF NOT EXISTS idx_leaf_subtopics_module_id
  ON public.leaf_subtopics (module_id);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_leaf_subtopic_id
  ON public.quiz_submissions (leaf_subtopic_id);

CREATE INDEX IF NOT EXISTS idx_user_progress_leaf_subtopic_id
  ON public.user_progress (leaf_subtopic_id);
