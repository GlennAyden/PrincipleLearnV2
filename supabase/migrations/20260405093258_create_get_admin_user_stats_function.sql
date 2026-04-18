
-- Server-side aggregation function for admin user listing.
-- Replaces 9 parallel full-table scans with a single optimized query
-- that returns per-user counts and last activity dates.

CREATE OR REPLACE FUNCTION get_admin_user_stats()
RETURNS TABLE (
  id uuid,
  email text,
  "name" text,
  role text,
  created_at timestamptz,
  total_courses bigint,
  total_quizzes bigint,
  total_journals bigint,
  total_transcripts bigint,
  total_ask_questions bigint,
  total_challenges bigint,
  total_discussions bigint,
  total_feedbacks bigint,
  completed_progress bigint,
  total_progress bigint,
  last_activity timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    u.id,
    u.email,
    u.name,
    u.role,
    u.created_at,
    COALESCE(c.cnt, 0)            AS total_courses,
    COALESCE(qs.cnt, 0)           AS total_quizzes,
    COALESCE(j.cnt, 0)            AS total_journals,
    COALESCE(t.cnt, 0)            AS total_transcripts,
    COALESCE(aq.cnt, 0)           AS total_ask_questions,
    COALESCE(cr.cnt, 0)           AS total_challenges,
    COALESCE(ds.cnt, 0)           AS total_discussions,
    COALESCE(fb.cnt, 0)           AS total_feedbacks,
    COALESCE(up_done.cnt, 0)      AS completed_progress,
    COALESCE(up_all.cnt, 0)       AS total_progress,
    GREATEST(
      u.created_at,
      c.last_at, qs.last_at, j.last_at, t.last_at,
      aq.last_at, cr.last_at, ds.last_at, fb.last_at
    ) AS last_activity
  FROM users u
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(courses.created_at) AS last_at
    FROM courses WHERE courses.created_by = u.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(COALESCE(quiz_submissions.created_at, quiz_submissions.created_at)) AS last_at
    FROM quiz_submissions WHERE quiz_submissions.user_id = u.id
  ) qs ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(jurnal.created_at) AS last_at
    FROM jurnal WHERE jurnal.user_id = u.id
  ) j ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(transcript.created_at) AS last_at
    FROM transcript WHERE transcript.user_id = u.id
  ) t ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(ask_question_history.created_at) AS last_at
    FROM ask_question_history WHERE ask_question_history.user_id = u.id
  ) aq ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(challenge_responses.created_at) AS last_at
    FROM challenge_responses WHERE challenge_responses.user_id = u.id::text
  ) cr ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(COALESCE(discussion_sessions.updated_at, discussion_sessions.created_at)) AS last_at
    FROM discussion_sessions WHERE discussion_sessions.user_id = u.id
  ) ds ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt, MAX(feedback.created_at) AS last_at
    FROM feedback WHERE feedback.user_id = u.id
  ) fb ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM user_progress WHERE user_progress.user_id = u.id AND user_progress.is_completed = true
  ) up_done ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM user_progress WHERE user_progress.user_id = u.id
  ) up_all ON true
  ORDER BY u.created_at DESC;
$$;
;
