-- ============================================================================
-- FIX: RLS policies missing on core tables
--
-- CloneSupa's replay left the target project with RLS enabled on all core
-- tables (profiles, organizations, organization_members, user_roles,
-- companies, documents, document_types, etc.) but WITHOUT the SELECT/INSERT/
-- UPDATE/DELETE policies. Signed-in users therefore saw empty results from
-- every table and could not read their own profile or org data after login.
--
-- This migration is idempotent and recreates the required policies using the
-- existing public.is_org_member / public.has_role / public.is_platform_admin
-- SECURITY DEFINER helpers.
-- ============================================================================

-- ===== profiles =====
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));

-- ===== organizations =====
DROP POLICY IF EXISTS "Members can view their organizations" ON public.organizations;
CREATE POLICY "Members can view their organizations" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), id) OR public.is_platform_admin(auth.uid()));

-- ===== organization_members =====
DROP POLICY IF EXISTS "Members can view memberships of their orgs" ON public.organization_members;
CREATE POLICY "Members can view memberships of their orgs" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins can manage memberships" ON public.organization_members;
CREATE POLICY "Org admins can manage memberships" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), org_id, 'org_admin') OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins can delete memberships" ON public.organization_members;
CREATE POLICY "Org admins can delete memberships" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin') OR public.is_platform_admin(auth.uid()));

-- ===== user_roles =====
DROP POLICY IF EXISTS "Users can view roles in their orgs" ON public.user_roles;
CREATE POLICY "Users can view roles in their orgs" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id))
    OR public.is_platform_admin(auth.uid())
  );

-- ===== companies =====
DROP POLICY IF EXISTS "Org members can view companies" ON public.companies;
CREATE POLICY "Org members can view companies" ON public.companies
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Org members can insert companies" ON public.companies;
CREATE POLICY "Org members can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Org members can update companies" ON public.companies;
CREATE POLICY "Org members can update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id))
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Org admins can delete companies" ON public.companies;
CREATE POLICY "Org admins can delete companies" ON public.companies
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin') OR public.is_platform_admin(auth.uid()));

-- ===== documents =====
DROP POLICY IF EXISTS "Members view documents" ON public.documents;
CREATE POLICY "Members view documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Members insert documents" ON public.documents;
CREATE POLICY "Members insert documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS "Members update documents" ON public.documents;
CREATE POLICY "Members update documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins delete documents" ON public.documents;
CREATE POLICY "Org admins delete documents" ON public.documents
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin') OR public.is_platform_admin(auth.uid()));

-- ===== document_types =====
DROP POLICY IF EXISTS "Members view types" ON public.document_types;
CREATE POLICY "Members view types" ON public.document_types
  FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Members insert types" ON public.document_types;
CREATE POLICY "Members insert types" ON public.document_types
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

DROP POLICY IF EXISTS "Org admins update types" ON public.document_types;
CREATE POLICY "Org admins update types" ON public.document_types
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin') OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Org admins delete types" ON public.document_types;
CREATE POLICY "Org admins delete types" ON public.document_types
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin') OR public.is_platform_admin(auth.uid()));

-- ===== ancillary tables (guarded so absent tables are skipped) =====
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'ai_usage_logs','document_type_fields','user_document_access'
  ]) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS "Members view %I" ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY "Members view %I" ON public.%I FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id) OR public.is_platform_admin(auth.uid()))',
        t, t
      );
    END IF;
  END LOOP;
END $$;
