CREATE TABLE IF NOT EXISTS public.user_document_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id, document_type_id)
);

CREATE INDEX IF NOT EXISTS uda_org_idx ON public.user_document_access(org_id);
CREATE INDEX IF NOT EXISTS uda_user_idx ON public.user_document_access(user_id);
CREATE INDEX IF NOT EXISTS uda_company_idx ON public.user_document_access(company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_document_access TO authenticated;
GRANT ALL ON public.user_document_access TO service_role;

ALTER TABLE public.user_document_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read access" ON public.user_document_access
  FOR SELECT TO authenticated
  USING (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "members insert access" ON public.user_document_access
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "members delete access" ON public.user_document_access
  FOR DELETE TO authenticated
  USING (private.is_org_member(auth.uid(), org_id));