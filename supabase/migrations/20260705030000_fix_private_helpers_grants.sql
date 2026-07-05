-- Fix RLS policies referencing private.* helpers that had EXECUTE revoked
-- from authenticated. Symptom: signed-in users saw empty results from every
-- protected table (profiles, organization_members, companies, documents…)
-- because RLS policy evaluation could not call the helpers.
--
-- SECURITY DEFINER on these functions means the function body runs as the
-- owner (bypassing RLS on organization_members / user_roles), so granting
-- EXECUTE does not widen data access.

GRANT USAGE ON SCHEMA private TO authenticated, anon;

GRANT EXECUTE ON FUNCTION private.is_org_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION private.is_platform_admin(uuid) TO authenticated, anon;
