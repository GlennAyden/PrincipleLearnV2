DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'research_evidence_items'
      AND policyname = 'research_evidence_items_own'
  ) THEN
    ALTER POLICY "research_evidence_items_own"
      ON public.research_evidence_items
      TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
  ELSE
    CREATE POLICY "research_evidence_items_own"
      ON public.research_evidence_items
      FOR ALL
      TO authenticated
      USING (user_id = (select auth.uid()))
      WITH CHECK (user_id = (select auth.uid()));
  END IF;
END
$$;
