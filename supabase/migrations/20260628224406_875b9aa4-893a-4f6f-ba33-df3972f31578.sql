CREATE OR REPLACE FUNCTION public.get_org_document_stats(
  _org_id uuid,
  _allowed_type_ids uuid[] DEFAULT NULL
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
    AND d.deleted_at IS NULL
    AND (
      _allowed_type_ids IS NULL
      OR cardinality(_allowed_type_ids) = 0
      OR d.document_type_id = ANY(_allowed_type_ids)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_org_document_stats(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_document_stats(uuid, uuid[]) TO service_role;