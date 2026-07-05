
-- 1. Restrict user_document_access SELECT to org admins / platform admins
DROP POLICY IF EXISTS "members read access" ON public.user_document_access;
CREATE POLICY "admins read access" ON public.user_document_access
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), org_id, 'org_admin'::public.app_role)
  OR public.is_platform_admin(auth.uid())
);

-- 2. Revoke EXECUTE from authenticated/anon/public on SECURITY DEFINER functions
-- that should only run via triggers or service_role
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_document_types() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_doc_type_column(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.drop_doc_type_column(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_doc_type_table(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_doc_type_row(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
