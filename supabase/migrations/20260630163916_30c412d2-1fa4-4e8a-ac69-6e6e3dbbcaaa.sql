
-- 1. Fix dt_ table policies: split ALL into per-command, restrict DELETE to org_admin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['dt_alexandreruy_fd2cc3ad','dt_investimentos_bfff4924'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'members can manage ' || t, t);

    EXECUTE format($p$CREATE POLICY "members can select %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "members can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "members can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));$p$, t);
    EXECUTE format($p$CREATE POLICY "admins can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), org_id, 'org_admin'::public.app_role));$p$, t);
  END LOOP;
END$$;

-- Update create_doc_type_table to apply the same split for future dt_ tables
CREATE OR REPLACE FUNCTION public.create_doc_type_table(_type_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  EXECUTE format($p$CREATE POLICY "members can select %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_org_member(auth.uid(), org_id));$p$, v_table);
  EXECUTE format($p$CREATE POLICY "members can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_org_member(auth.uid(), org_id));$p$, v_table);
  EXECUTE format($p$CREATE POLICY "members can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_org_member(auth.uid(), org_id)) WITH CHECK (public.is_org_member(auth.uid(), org_id));$p$, v_table);
  EXECUTE format($p$CREATE POLICY "admins can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), org_id, 'org_admin'::public.app_role));$p$, v_table);

  EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();', v_table);

  FOR v_field IN
    SELECT field_key, field_type FROM public.document_type_fields WHERE document_type_id = _type_id
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s',
                   v_table, public._dt_safe_ident(v_field.field_key), public._dt_sql_type(v_field.field_type));
  END LOOP;

  UPDATE public.document_types SET storage_table = v_table WHERE id = _type_id;
  RETURN v_table;
END;
$function$;

-- 2. Explicit UPDATE policy on user_document_access (admins only)
DROP POLICY IF EXISTS "admins can update user_document_access" ON public.user_document_access;
CREATE POLICY "admins can update user_document_access"
ON public.user_document_access
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), org_id, 'org_admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), org_id, 'org_admin'::public.app_role));

-- 3. Set search_path on the two helper functions missing it
CREATE OR REPLACE FUNCTION public._dt_sql_type(_field_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE lower(coalesce(_field_type, 'text'))
    WHEN 'number' THEN 'numeric'
    WHEN 'date'   THEN 'date'
    ELSE 'text'
  END;
$function$;

CREATE OR REPLACE FUNCTION public._dt_safe_ident(_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(lower(coalesce(_raw,'')), '[^a-z0-9_]+', '_', 'g');
$function$;

-- 4. Revoke broad EXECUTE on SECURITY DEFINER functions; keep only what's needed.

-- Trigger-only / internal: no client should call these.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_default_document_types() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- Schema-management helpers: called from privileged server fns only.
REVOKE ALL ON FUNCTION public.create_doc_type_table(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_doc_type_column(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.drop_doc_type_column(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_doc_type_row(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- Internal identifier helpers
REVOKE ALL ON FUNCTION public._dt_safe_ident(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._dt_sql_type(text) FROM PUBLIC, anon;

-- Role-check helpers used in RLS: needed by authenticated, not anon.
REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

-- Stats RPCs called by the app
REVOKE ALL ON FUNCTION public.get_org_document_stats(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_org_document_stats(uuid, uuid[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_document_stats(uuid, uuid, uuid, text, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_document_stats(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_document_stats(uuid, uuid[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_stats(uuid, uuid, uuid, text, uuid[], jsonb) TO authenticated;
