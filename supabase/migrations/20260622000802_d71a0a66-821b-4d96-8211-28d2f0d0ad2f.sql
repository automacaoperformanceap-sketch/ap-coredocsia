
CREATE TABLE public.ai_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name text,
  document_type_id uuid REFERENCES public.document_types(id) ON DELETE SET NULL,
  document_type_name text,
  file_name text NOT NULL,
  model text NOT NULL DEFAULT 'gemini-2.5-flash-lite',
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_usage_logs_org_created_idx ON public.ai_usage_logs (org_id, created_at DESC);
CREATE INDEX ai_usage_logs_company_idx ON public.ai_usage_logs (company_id);

GRANT SELECT, INSERT ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members can read org ai usage"
  ON public.ai_usage_logs FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), org_id));

CREATE POLICY "members can insert own ai usage"
  ON public.ai_usage_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(auth.uid(), org_id) AND user_id = auth.uid());
