
-- 1) Fix has_role logic in both schemas: always require matching org_id
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _org_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role and org_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role AND org_id = _org_id
  )
$$;

-- 2) Tighten user_document_access INSERT/DELETE to org admins only
DROP POLICY IF EXISTS "members insert access" ON public.user_document_access;
DROP POLICY IF EXISTS "members delete access" ON public.user_document_access;

CREATE POLICY "Org admins insert access" ON public.user_document_access
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_member(auth.uid(), org_id)
    AND (private.has_role(auth.uid(), org_id, 'org_admin'::public.app_role)
         OR private.is_platform_admin(auth.uid()))
  );

CREATE POLICY "Org admins delete access" ON public.user_document_access
  FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), org_id, 'org_admin'::public.app_role)
    OR private.is_platform_admin(auth.uid())
  );

-- 3) Move ai_usage_logs DELETE policy to private.* helpers
DROP POLICY IF EXISTS "Org admins can delete ai usage" ON public.ai_usage_logs;
CREATE POLICY "Org admins can delete ai usage" ON public.ai_usage_logs
  FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), org_id, 'org_admin'::public.app_role)
    OR private.is_platform_admin(auth.uid())
  );

DROP POLICY IF EXISTS "members can read org ai usage" ON public.ai_usage_logs;
CREATE POLICY "members can read org ai usage" ON public.ai_usage_logs
  FOR SELECT TO authenticated
  USING (private.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "members can insert own ai usage" ON public.ai_usage_logs;
CREATE POLICY "members can insert own ai usage" ON public.ai_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_member(auth.uid(), org_id) AND user_id = auth.uid());

-- 4) Revoke EXECUTE on public SECURITY DEFINER helpers from signed-in users.
-- Policies use private.* equivalents; nothing in app code calls these via RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
