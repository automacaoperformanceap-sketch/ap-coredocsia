ALTER TABLE public.document_types
  ADD CONSTRAINT document_types_company_id_name_unique
  UNIQUE (company_id, name);