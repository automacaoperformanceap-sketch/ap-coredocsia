
-- Fix 1: Scope document_type_lookups policies to authenticated role only
DROP POLICY IF EXISTS "Members read lookups" ON public.document_type_lookups;
DROP POLICY IF EXISTS "Org admins insert lookups" ON public.document_type_lookups;
DROP POLICY IF EXISTS "Org admins update lookups" ON public.document_type_lookups;
DROP POLICY IF EXISTS "Org admins delete lookups" ON public.document_type_lookups;

CREATE POLICY "Members read lookups" ON public.document_type_lookups
  FOR SELECT TO authenticated
  USING (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org admins insert lookups" ON public.document_type_lookups
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_member(auth.uid(), org_id)
    AND (private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
         OR private.is_platform_admin(auth.uid()))
  );

CREATE POLICY "Org admins update lookups" ON public.document_type_lookups
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
         OR private.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
              OR private.is_platform_admin(auth.uid()));

CREATE POLICY "Org admins delete lookups" ON public.document_type_lookups
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
         OR private.is_platform_admin(auth.uid()));

-- Fix 2: Harden user_roles INSERT policy to prevent privilege escalation.
-- The platform_admin role can ONLY be granted via service-role/admin code paths,
-- never through RLS. Org admins may grant non-admin / non-platform-admin roles
-- within their own org via a dedicated, strictly-scoped policy.
DROP POLICY IF EXISTS "Platform admins insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Org admins insert org roles" ON public.user_roles;

-- Platform admins may insert any role EXCEPT platform_admin (which must be
-- granted out-of-band via service_role to eliminate any RLS-based escalation path).
CREATE POLICY "Platform admins insert non-platform roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_platform_admin(auth.uid())
    AND role <> 'platform_admin'::app_role
    AND user_id <> auth.uid()
  );

-- Org admins may grant org-scoped roles (other than org_admin/platform_admin)
-- to other members of their own organization.
CREATE POLICY "Org admins insert org roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND private.has_role(auth.uid(), org_id, 'org_admin'::app_role)
    AND private.is_org_member(user_id, org_id)
    AND role NOT IN ('platform_admin'::app_role, 'org_admin'::app_role)
    AND user_id <> auth.uid()
  );
