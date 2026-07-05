DROP POLICY IF EXISTS "members can update org ai usage" ON public.ai_usage_logs;
CREATE POLICY "users update own ai usage or admin"
ON public.ai_usage_logs FOR UPDATE
TO authenticated
USING (
  (user_id = auth.uid() AND private.is_org_member(auth.uid(), org_id))
  OR private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
  OR private.is_platform_admin(auth.uid())
)
WITH CHECK (
  (user_id = auth.uid() AND private.is_org_member(auth.uid(), org_id))
  OR private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
  OR private.is_platform_admin(auth.uid())
);