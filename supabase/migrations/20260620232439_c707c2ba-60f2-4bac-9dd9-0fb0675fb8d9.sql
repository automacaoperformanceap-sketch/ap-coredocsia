GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_platform_admin(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';