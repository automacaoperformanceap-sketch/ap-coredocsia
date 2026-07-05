CREATE OR REPLACE FUNCTION public.get_org_document_stats(_org_id uuid, _allowed_type_ids uuid[] DEFAULT NULL::uuid[], _company_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total bigint, processed bigint, pending bigint, failed bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE d.status = 'processed') AS processed,
    count(*) FILTER (WHERE d.status IN ('pending', 'processing')) AS pending,
    count(*) FILTER (WHERE d.status = 'failed') AS failed
  FROM public.documents d
  WHERE d.org_id = _org_id
    AND d.deleted_at IS NULL
    AND (_company_id IS NULL OR d.company_id = _company_id)
    AND (
      _allowed_type_ids IS NULL
      OR cardinality(_allowed_type_ids) = 0
      OR d.document_type_id = ANY(_allowed_type_ids)
    );
$function$;