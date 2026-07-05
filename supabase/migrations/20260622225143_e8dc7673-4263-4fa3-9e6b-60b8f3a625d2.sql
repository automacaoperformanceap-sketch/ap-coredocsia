
-- 1. Tighten document_type_lookups RLS: only org admins can write; use private.* helpers
DROP POLICY IF EXISTS "Org members can view lookups" ON public.document_type_lookups;
DROP POLICY IF EXISTS "Org members can insert lookups" ON public.document_type_lookups;
DROP POLICY IF EXISTS "Org members can update lookups" ON public.document_type_lookups;
DROP POLICY IF EXISTS "Org members can delete lookups" ON public.document_type_lookups;

CREATE POLICY "Members read lookups" ON public.document_type_lookups
  FOR SELECT USING (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org admins insert lookups" ON public.document_type_lookups
  FOR INSERT WITH CHECK (
    private.is_org_member(auth.uid(), org_id)
    AND (private.has_role(auth.uid(), org_id, 'org_admin'::app_role) OR private.is_platform_admin(auth.uid()))
  );

CREATE POLICY "Org admins update lookups" ON public.document_type_lookups
  FOR UPDATE USING (
    private.has_role(auth.uid(), org_id, 'org_admin'::app_role) OR private.is_platform_admin(auth.uid())
  ) WITH CHECK (
    private.has_role(auth.uid(), org_id, 'org_admin'::app_role) OR private.is_platform_admin(auth.uid())
  );

CREATE POLICY "Org admins delete lookups" ON public.document_type_lookups
  FOR DELETE USING (
    private.has_role(auth.uid(), org_id, 'org_admin'::app_role) OR private.is_platform_admin(auth.uid())
  );

-- 2. Revoke EXECUTE on public SECURITY DEFINER helper functions from anon/authenticated.
-- These are duplicates of the canonical private.* versions used by RLS, and being callable
-- via the Data API creates ambiguity and a privilege-check surface. Keep them defined for
-- backward compatibility but make them non-executable from PostgREST roles.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_document_types() FROM PUBLIC, anon, authenticated;
