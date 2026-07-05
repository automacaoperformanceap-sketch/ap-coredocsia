
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  contact_person TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_companies_org ON public.companies(org_id, created_at DESC);
CREATE INDEX idx_companies_name ON public.companies(org_id, name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view companies"
  ON public.companies FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert companies"
  ON public.companies FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update companies"
  ON public.companies FOR UPDATE TO authenticated
  USING (public.is_org_member(auth.uid(), org_id))
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org admins can delete companies"
  ON public.companies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), org_id, 'org_admin'));

CREATE TRIGGER tg_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
