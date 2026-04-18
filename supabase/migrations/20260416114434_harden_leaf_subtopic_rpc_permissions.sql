-- docs/sql/harden_leaf_subtopic_rpc_permissions.sql
--
-- Keep quiz leaf-subtopic RPCs server-only. They are SECURITY INVOKER, but
-- explicit EXECUTE grants should still be limited to the backend service role.

REVOKE ALL ON FUNCTION public.ensure_leaf_subtopic(uuid, uuid, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.ensure_leaf_subtopic(uuid, uuid, text, text, integer, integer)
  TO service_role;

REVOKE ALL ON FUNCTION public.insert_quiz_attempt(uuid, uuid, uuid, text, uuid, integer, integer, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.insert_quiz_attempt(uuid, uuid, uuid, text, uuid, integer, integer, uuid, jsonb)
  TO service_role;
;
