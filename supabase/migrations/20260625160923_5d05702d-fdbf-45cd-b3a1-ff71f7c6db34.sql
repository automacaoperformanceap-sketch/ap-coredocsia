
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_gemini_model text NOT NULL DEFAULT 'gemini-2.5-flash',
  ADD COLUMN IF NOT EXISTS ai_claude_model text NOT NULL DEFAULT 'claude-haiku-4-5-20251001';
