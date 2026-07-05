ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS document_types_company_id_idx ON public.document_types(company_id);
CREATE INDEX IF NOT EXISTS document_types_org_id_idx ON public.document_types(org_id);