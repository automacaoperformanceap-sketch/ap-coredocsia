DROP POLICY IF EXISTS "org admins can delete ai usage" ON public.ai_usage_logs;
CREATE POLICY "Org admins can delete ai usage"
ON public.ai_usage_logs
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), org_id, 'org_admin'::app_role)
  OR public.is_platform_admin(auth.uid())
);