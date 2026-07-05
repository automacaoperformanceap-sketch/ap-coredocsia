ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS drive_folder_id text;
ALTER TABLE public.document_types ADD COLUMN IF NOT EXISTS drive_folder_id text;