UPDATE public.companies SET drive_folder_id = NULL WHERE drive_folder_id IS NOT NULL;
DELETE FROM public.documents WHERE drive_file_id IS NOT NULL;