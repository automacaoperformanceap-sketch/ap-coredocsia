
-- 1. Coluna que aponta para a tabela física por tipo
ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS storage_table text;

-- 2. Helper: mapeia field_type -> tipo SQL
CREATE OR REPLACE FUNCTION public._dt_sql_type(_field_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_field_type, 'text'))
    WHEN 'number' THEN 'numeric'
    WHEN 'date'   THEN 'date'
    ELSE 'text'
  END;
$$;

-- 3. Helper: sanitiza identificador
CREATE OR REPLACE FUNCTION public._dt_safe_ident(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(lower(coalesce(_raw,'')), '[^a-z0-9_]+', '_', 'g');
$$;

-- 4. Cria a tabela física dedicada para o tipo
CREATE OR REPLACE FUNCTION public.create_doc_type_table(_type_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_org  uuid;
  v_table text;
  v_existing text;
  v_field record;
BEGIN
  SELECT slug, org_id, storage_table INTO v_slug, v_org, v_existing
  FROM public.document_types WHERE id = _type_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'document_type % não encontrado', _type_id; END IF;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_table := 'dt_' || public._dt_safe_ident(v_slug) || '_' || substr(replace(_type_id::text,'-',''),1,8);

  EXECUTE format($f$
    CREATE TABLE IF NOT EXISTS public.%I (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
      org_id uuid NOT NULL,
      company_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  $f$, v_table);

  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', v_table);
  EXECUTE format('GRANT ALL ON public.%I TO service_role;', v_table);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', v_table);

  EXECUTE format($p$
    CREATE POLICY "members can manage %1$s"
    ON public.%1$I FOR ALL
    TO authenticated
    USING (public.is_org_member(auth.uid(), org_id))
    WITH CHECK (public.is_org_member(auth.uid(), org_id));
  $p$, v_table);

  EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();', v_table);

  -- Adiciona colunas para campos já cadastrados (se houver)
  FOR v_field IN
    SELECT field_key, field_type FROM public.document_type_fields WHERE document_type_id = _type_id
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s',
                   v_table, public._dt_safe_ident(v_field.field_key), public._dt_sql_type(v_field.field_type));
  END LOOP;

  UPDATE public.document_types SET storage_table = v_table WHERE id = _type_id;
  RETURN v_table;
END;
$$;

-- 5. Adiciona coluna ao tipo, se houver storage_table
CREATE OR REPLACE FUNCTION public.add_doc_type_column(_type_id uuid, _field_key text, _field_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_table text;
BEGIN
  SELECT storage_table INTO v_table FROM public.document_types WHERE id = _type_id;
  IF v_table IS NULL THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s',
                 v_table, public._dt_safe_ident(_field_key), public._dt_sql_type(_field_type));
END;
$$;

-- 6. Remove coluna do tipo, se houver storage_table
CREATE OR REPLACE FUNCTION public.drop_doc_type_column(_type_id uuid, _field_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_table text;
BEGIN
  SELECT storage_table INTO v_table FROM public.document_types WHERE id = _type_id;
  IF v_table IS NULL THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I',
                 v_table, public._dt_safe_ident(_field_key));
END;
$$;

-- 7. Insere/atualiza dados na tabela do tipo (no-op se sem storage_table)
CREATE OR REPLACE FUNCTION public.upsert_doc_type_row(_type_id uuid, _document_id uuid, _values jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text;
  v_org uuid;
  v_company uuid;
  v_cols text := '';
  v_vals text := '';
  v_set  text := '';
  v_key text;
  v_val text;
  v_safe text;
BEGIN
  SELECT storage_table INTO v_table FROM public.document_types WHERE id = _type_id;
  IF v_table IS NULL THEN RETURN; END IF;

  SELECT org_id, company_id INTO v_org, v_company FROM public.documents WHERE id = _document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'documento % não encontrado', _document_id; END IF;

  FOR v_key, v_val IN SELECT key, value FROM jsonb_each_text(coalesce(_values, '{}'::jsonb))
  LOOP
    v_safe := public._dt_safe_ident(v_key);
    -- só inclui se a coluna existir na tabela
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=v_table AND column_name=v_safe
    ) THEN
      v_cols := v_cols || format(', %I', v_safe);
      v_vals := v_vals || format(', %L', v_val);
      v_set  := v_set  || format(', %I = EXCLUDED.%I', v_safe, v_safe);
    END IF;
  END LOOP;

  EXECUTE format(
    'INSERT INTO public.%I (document_id, org_id, company_id%s) VALUES (%L, %L, %L%s)
     ON CONFLICT (document_id) DO UPDATE SET updated_at = now()%s',
    v_table, v_cols, _document_id, v_org, v_company, v_vals, v_set
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_doc_type_table(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_doc_type_column(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drop_doc_type_column(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_doc_type_row(uuid, uuid, jsonb) TO authenticated, service_role;
