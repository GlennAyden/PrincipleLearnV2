-- Returns all JSONB columns in the public schema, grouped by table.
-- Called by the application to auto-detect JSONB columns instead of manual mapping.

CREATE OR REPLACE FUNCTION get_jsonb_columns()
RETURNS TABLE (table_name text, column_name text)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT c.table_name::text, c.column_name::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.data_type = 'jsonb'
  ORDER BY c.table_name, c.column_name;
$$;
