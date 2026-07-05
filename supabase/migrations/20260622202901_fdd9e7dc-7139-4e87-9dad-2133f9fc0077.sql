
-- 1) Coluna is_lookup_key
ALTER TABLE public.document_type_fields
  ADD COLUMN IF NOT EXISTS is_lookup_key boolean NOT NULL DEFAULT false;

-- Índice único parcial: máx 1 campo-chave por document_type
CREATE UNIQUE INDEX IF NOT EXISTS ux_dtf_one_lookup_key
  ON public.document_type_fields(document_type_id)
  WHERE is_lookup_key = true;

-- 2) Tabela document_type_lookups
CREATE TABLE IF NOT EXISTS public.document_type_lookups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  key_value text NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type_id, key_value)
);

CREATE INDEX IF NOT EXISTS ix_dtl_doctype ON public.document_type_lookups(document_type_id);
CREATE INDEX IF NOT EXISTS ix_dtl_org ON public.document_type_lookups(org_id);

-- 3) GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_type_lookups TO authenticated;
GRANT ALL ON public.document_type_lookups TO service_role;

-- 4) RLS
ALTER TABLE public.document_type_lookups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view lookups"
  ON public.document_type_lookups FOR SELECT
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can insert lookups"
  ON public.document_type_lookups FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can update lookups"
  ON public.document_type_lookups FOR UPDATE
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id))
  WITH CHECK (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "Org members can delete lookups"
  ON public.document_type_lookups FOR DELETE
  TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

-- 5) Trigger updated_at
DROP TRIGGER IF EXISTS set_updated_at_dtl ON public.document_type_lookups;
CREATE TRIGGER set_updated_at_dtl
  BEFORE UPDATE ON public.document_type_lookups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
