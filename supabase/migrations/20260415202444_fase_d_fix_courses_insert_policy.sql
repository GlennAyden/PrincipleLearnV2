
DROP POLICY IF EXISTS courses_insert_own ON public.courses;
CREATE POLICY courses_insert_own ON public.courses
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (select auth.uid()));
;
