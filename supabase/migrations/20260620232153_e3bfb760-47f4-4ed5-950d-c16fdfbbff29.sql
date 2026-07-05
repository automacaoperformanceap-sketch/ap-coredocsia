CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND org_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _org_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (org_id = _org_id OR _role = 'platform_admin')
  )
$$;

CREATE OR REPLACE FUNCTION private.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'platform_admin'
  )
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

ALTER POLICY "Members can view their organizations" ON public.organizations
  USING (private.is_org_member(auth.uid(), id) OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Org admins can update their organization" ON public.organizations
  USING (private.has_role(auth.uid(), id, 'org_admin') OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Platform admins can insert organizations" ON public.organizations
  WITH CHECK (private.is_platform_admin(auth.uid()));

ALTER POLICY "Platform admins can delete organizations" ON public.organizations
  USING (private.is_platform_admin(auth.uid()));

ALTER POLICY "Members can view memberships of their orgs" ON public.organization_members
  USING (private.is_org_member(auth.uid(), org_id) OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Org admins can manage memberships" ON public.organization_members
  WITH CHECK (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Org admins can delete memberships" ON public.organization_members
  USING (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Users can view their own profile" ON public.profiles
  USING (id = auth.uid() OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Users can view roles in their orgs" ON public.user_roles
  USING (
    user_id = auth.uid()
    OR (org_id IS NOT NULL AND private.is_org_member(auth.uid(), org_id))
    OR private.is_platform_admin(auth.uid())
  );

ALTER POLICY "Members view types" ON public.document_types
  USING (private.is_org_member(auth.uid(), org_id) OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Members insert types" ON public.document_types
  WITH CHECK (private.is_org_member(auth.uid(), org_id));

ALTER POLICY "Org admins update types" ON public.document_types
  USING (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Org admins delete types" ON public.document_types
  USING (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Members view documents" ON public.documents
  USING (private.is_org_member(auth.uid(), org_id) OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Members insert documents" ON public.documents
  WITH CHECK (private.is_org_member(auth.uid(), org_id) AND uploaded_by = auth.uid());

ALTER POLICY "Members update documents" ON public.documents
  USING (private.is_org_member(auth.uid(), org_id) OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Org admins delete documents" ON public.documents
  USING (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

ALTER POLICY "Org members can view companies" ON public.companies
  USING (private.is_org_member(auth.uid(), org_id));

ALTER POLICY "Org members can insert companies" ON public.companies
  WITH CHECK (private.is_org_member(auth.uid(), org_id));

ALTER POLICY "Org members can update companies" ON public.companies
  USING (private.is_org_member(auth.uid(), org_id))
  WITH CHECK (private.is_org_member(auth.uid(), org_id));

ALTER POLICY "Org admins can delete companies" ON public.companies
  USING (private.has_role(auth.uid(), org_id, 'org_admin'));

ALTER POLICY "Org members read documents bucket" ON storage.objects
  USING (
    bucket_id = 'documents'
    AND private.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

ALTER POLICY "Org members upload to documents bucket" ON storage.objects
  WITH CHECK (
    bucket_id = 'documents'
    AND private.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

ALTER POLICY "Org members update documents bucket" ON storage.objects
  USING (
    bucket_id = 'documents'
    AND private.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

ALTER POLICY "Org admins delete documents bucket" ON storage.objects
  USING (
    bucket_id = 'documents'
    AND (
      private.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'org_admin')
      OR private.is_platform_admin(auth.uid())
    )
  );

REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_document_types() FROM PUBLIC, anon, authenticated;