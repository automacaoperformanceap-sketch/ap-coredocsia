CREATE OR REPLACE FUNCTION public.get_document_stats(
  _org_id uuid,
  _company_id uuid,
  _document_type_id uuid,
  _search text DEFAULT '',
  _allowed_type_ids uuid[] DEFAULT NULL,
  _field_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(total bigint, processed bigint, pending bigint, failed bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE d.status = 'processed') AS processed,
    count(*) FILTER (WHERE d.status IN ('pending', 'processing')) AS pending,
    count(*) FILTER (WHERE d.status = 'failed') AS failed
  FROM public.documents d
  WHERE d.org_id = _org_id
    AND d.company_id = _company_id
    AND d.document_type_id = _document_type_id
    AND d.deleted_at IS NULL
    AND (
      _allowed_type_ids IS NULL
      OR cardinality(_allowed_type_ids) = 0
      OR d.document_type_id = ANY(_allowed_type_ids)
    )
    AND (
      coalesce(nullif(btrim(_search), ''), '') = ''
      OR d.name ILIKE ('%' || btrim(_search) || '%')
    )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each_text(coalesce(_field_filters, '{}'::jsonb)) AS filters(key, value)
      WHERE btrim(filters.value) <> ''
        AND coalesce(d.field_values ->> filters.key, '') NOT ILIKE ('%' || btrim(filters.value) || '%')
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_document_stats(uuid, uuid, uuid, text, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_stats(uuid, uuid, uuid, text, uuid[], jsonb) TO service_role;