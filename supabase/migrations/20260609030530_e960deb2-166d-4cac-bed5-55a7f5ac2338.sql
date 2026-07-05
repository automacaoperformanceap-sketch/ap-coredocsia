
-- Enum de status
create type public.doc_status as enum ('pending','processing','processed','failed');

-- Tipos de documentos
create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);

grant select, insert, update, delete on public.document_types to authenticated;
grant all on public.document_types to service_role;

alter table public.document_types enable row level security;

create policy "Members view types" on public.document_types
  for select to authenticated
  using (public.is_org_member(auth.uid(), org_id) or public.is_platform_admin(auth.uid()));
create policy "Members insert types" on public.document_types
  for insert to authenticated
  with check (public.is_org_member(auth.uid(), org_id));
create policy "Org admins update types" on public.document_types
  for update to authenticated
  using (public.has_role(auth.uid(), org_id, 'org_admin') or public.is_platform_admin(auth.uid()));
create policy "Org admins delete types" on public.document_types
  for delete to authenticated
  using (public.has_role(auth.uid(), org_id, 'org_admin') or public.is_platform_admin(auth.uid()));

-- Documentos
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  name text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  storage_path text not null,
  document_type_id uuid references public.document_types(id) on delete set null,
  tags text[] not null default '{}',
  status public.doc_status not null default 'pending',
  error_message text,
  page_count int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index documents_org_status_created_idx on public.documents (org_id, status, created_at desc);
create index documents_org_type_idx on public.documents (org_id, document_type_id);
create index documents_tags_gin on public.documents using gin (tags);
create index documents_org_deleted_idx on public.documents (org_id) where deleted_at is null;

grant select, insert, update, delete on public.documents to authenticated;
grant all on public.documents to service_role;

alter table public.documents enable row level security;

create policy "Members view documents" on public.documents
  for select to authenticated
  using (public.is_org_member(auth.uid(), org_id) or public.is_platform_admin(auth.uid()));
create policy "Members insert documents" on public.documents
  for insert to authenticated
  with check (public.is_org_member(auth.uid(), org_id) and uploaded_by = auth.uid());
create policy "Members update documents" on public.documents
  for update to authenticated
  using (public.is_org_member(auth.uid(), org_id) or public.is_platform_admin(auth.uid()));
create policy "Org admins delete documents" on public.documents
  for delete to authenticated
  using (public.has_role(auth.uid(), org_id, 'org_admin') or public.is_platform_admin(auth.uid()));

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.tg_set_updated_at();

create trigger document_types_set_updated_at_noop
  before update on public.document_types
  for each row execute function public.tg_set_updated_at();

-- Realtime
alter table public.documents replica identity full;
alter publication supabase_realtime add table public.documents;

-- Seed default types per existing organization
insert into public.document_types (org_id, name, slug)
select o.id, t.name, t.slug
from public.organizations o
cross join (values
  ('Nota Fiscal','nota-fiscal'),
  ('Contrato','contrato'),
  ('RG/CNH','rg-cnh'),
  ('Comprovante','comprovante'),
  ('Outro','outro')
) as t(name, slug)
on conflict do nothing;

-- Trigger to seed default types for new orgs
create or replace function public.seed_default_document_types()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.document_types (org_id, name, slug) values
    (new.id, 'Nota Fiscal','nota-fiscal'),
    (new.id, 'Contrato','contrato'),
    (new.id, 'RG/CNH','rg-cnh'),
    (new.id, 'Comprovante','comprovante'),
    (new.id, 'Outro','outro')
  on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_seed_doc_types
  after insert on public.organizations
  for each row execute function public.seed_default_document_types();

-- Storage policies for the 'documents' bucket
-- Path convention: {org_id}/{document_id}/{filename}
create policy "Org members read documents bucket"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "Org members upload to documents bucket"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "Org members update documents bucket"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and public.is_org_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

create policy "Org admins delete documents bucket"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'org_admin')
      or public.is_platform_admin(auth.uid())
    )
  );
