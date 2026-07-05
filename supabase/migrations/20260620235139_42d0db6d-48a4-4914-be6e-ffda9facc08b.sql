CREATE TABLE IF NOT EXISTS public.document_type_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  label text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text','number','date','boolean','select')),
  required boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_type_id, field_key)
);

CREATE INDEX IF NOT EXISTS dtf_doc_type_idx ON public.document_type_fields(document_type_id);
CREATE INDEX IF NOT EXISTS dtf_org_idx ON public.document_type_fields(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_type_fields TO authenticated;
GRANT ALL ON public.document_type_fields TO service_role;

ALTER TABLE public.document_type_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read fields" ON public.document_type_fields
  FOR SELECT TO authenticated
  USING (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "members insert fields" ON public.document_type_fields
  FOR INSERT TO authenticated
  WITH CHECK (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "members update fields" ON public.document_type_fields
  FOR UPDATE TO authenticated
  USING (private.is_org_member(auth.uid(), org_id))
  WITH CHECK (private.is_org_member(auth.uid(), org_id));

CREATE POLICY "members delete fields" ON public.document_type_fields
  FOR DELETE TO authenticated
  USING (private.is_org_member(auth.uid(), org_id));

CREATE TRIGGER document_type_fields_set_updated_at
  BEFORE UPDATE ON public.document_type_fields
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();