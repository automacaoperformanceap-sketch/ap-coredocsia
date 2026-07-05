ALTER TABLE public.ai_usage_logs ADD COLUMN IF NOT EXISTS cost_brl NUMERIC(10, 4) DEFAULT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_logs TO authenticated;
GRANT ALL ON public.ai_usage_logs TO service_role;