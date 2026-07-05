ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS corrected_chars integer NOT NULL DEFAULT 0;

DROP POLICY IF EXISTS "members can update org ai usage" ON public.ai_usage_logs;
CREATE POLICY "members can update org ai usage"
  ON public.ai_usage_logs
  FOR UPDATE
  TO authenticated
  USING (private.is_org_member(auth.uid(), org_id))
  WITH CHECK (private.is_org_member(auth.uid(), org_id));