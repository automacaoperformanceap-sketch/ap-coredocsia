ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS drive_web_view_link text;
ALTER TABLE public.documents ALTER COLUMN storage_path DROP NOT NULL;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS drive_folder_id text;
CREATE INDEX IF NOT EXISTS documents_drive_file_id_idx ON public.documents(drive_file_id);