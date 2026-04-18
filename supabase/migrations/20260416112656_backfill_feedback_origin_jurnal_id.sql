CREATE OR REPLACE FUNCTION pg_temp.try_jsonb(value text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN value::jsonb;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.try_int(value text)
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN value::integer;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

WITH journal_fields AS (
  SELECT
    j.id AS jurnal_id,
    j.user_id,
    j.course_id,
    j.subtopic_id,
    NULLIF(BTRIM(j.subtopic_label), '') AS subtopic_label,
    j.module_index,
    j.subtopic_index,
    j.created_at,
    pg_temp.try_jsonb(j.content::text) AS content_json,
    pg_temp.try_jsonb(j.reflection::text) AS reflection_json
  FROM public.jurnal j
  WHERE j.type = 'structured_reflection'
),
journal_payload AS (
  SELECT
    jurnal_id,
    user_id,
    course_id,
    subtopic_id,
    subtopic_label,
    module_index,
    subtopic_index,
    created_at,
    NULLIF(
      BTRIM(COALESCE(
        content_json ->> 'contentFeedback',
        reflection_json #>> '{fields,contentFeedback}',
        ''
      )),
      ''
    ) AS content_feedback,
    pg_temp.try_int(NULLIF(
      BTRIM(COALESCE(
        content_json ->> 'contentRating',
        reflection_json #>> '{fields,contentRating}',
        ''
      )),
      ''
    )) AS content_rating
  FROM journal_fields
  WHERE content_json IS NOT NULL OR reflection_json IS NOT NULL
),
candidate_pairs AS (
  SELECT
    j.jurnal_id,
    f.id AS feedback_id,
    COUNT(*) OVER (PARTITION BY j.jurnal_id) AS candidates_for_journal,
    COUNT(*) OVER (PARTITION BY f.id) AS candidates_for_feedback
  FROM journal_payload j
  JOIN public.feedback f
    ON f.origin_jurnal_id IS NULL
   AND f.user_id = j.user_id
   AND f.course_id = j.course_id
   AND f.subtopic_id IS NOT DISTINCT FROM j.subtopic_id
   AND NULLIF(BTRIM(f.subtopic_label), '') IS NOT DISTINCT FROM j.subtopic_label
   AND f.module_index IS NOT DISTINCT FROM j.module_index
   AND f.subtopic_index IS NOT DISTINCT FROM j.subtopic_index
   AND f.rating IS NOT DISTINCT FROM j.content_rating
   AND NULLIF(BTRIM(f.comment), '') IS NOT DISTINCT FROM j.content_feedback
   AND ABS(EXTRACT(EPOCH FROM (f.created_at - j.created_at))) <= 300
  WHERE j.content_rating IS NOT NULL OR j.content_feedback IS NOT NULL
),
safe_pairs AS (
  SELECT jurnal_id, feedback_id
  FROM candidate_pairs
  WHERE candidates_for_journal = 1
    AND candidates_for_feedback = 1
)
UPDATE public.feedback f
SET origin_jurnal_id = sp.jurnal_id
FROM safe_pairs sp
WHERE f.id = sp.feedback_id
  AND f.origin_jurnal_id IS NULL;;
