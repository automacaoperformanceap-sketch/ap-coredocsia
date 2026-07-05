-- 1. Restrict write on document_type_fields to org admins
DROP POLICY IF EXISTS "members insert fields" ON public.document_type_fields;
DROP POLICY IF EXISTS "members update fields" ON public.document_type_fields;
DROP POLICY IF EXISTS "members delete fields" ON public.document_type_fields;

CREATE POLICY "Org admins insert fields" ON public.document_type_fields
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_org_member(auth.uid(), org_id)
    AND (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()))
  );

CREATE POLICY "Org admins update fields" ON public.document_type_fields
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()))
  WITH CHECK (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

CREATE POLICY "Org admins delete fields" ON public.document_type_fields
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), org_id, 'org_admin') OR private.is_platform_admin(auth.uid()));

-- 2. Deny-by-default write policies on user_roles (only platform_admin can write)
CREATE POLICY "Platform admins insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (private.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (private.is_platform_admin(auth.uid()))
  WITH CHECK (private.is_platform_admin(auth.uid()));

CREATE POLICY "Platform admins delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (private.is_platform_admin(auth.uid()));

-- 3. Restrict Realtime channel subscriptions to org members.
-- The client subscribes to topic `documents:<orgId>`; enforce org membership.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can read realtime documents channel" ON realtime.messages;
CREATE POLICY "Org members can read realtime documents channel"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() LIKE 'documents:%'
    AND private.is_org_member(
      auth.uid(),
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  );