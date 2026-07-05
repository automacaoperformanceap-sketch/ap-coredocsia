
-- ===== ENUM =====
create type public.app_role as enum ('platform_admin', 'org_admin', 'operator', 'viewer');

-- ===== ORGANIZATIONS =====
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;

-- ===== MEMBERSHIPS =====
create table public.organization_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

grant select, insert, update, delete on public.organization_members to authenticated;
grant all on public.organization_members to service_role;
alter table public.organization_members enable row level security;

-- ===== PROFILES =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  current_org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- ===== USER ROLES =====
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid references public.organizations(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, org_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- ===== SECURITY DEFINER HELPERS =====
create or replace function public.is_org_member(_user_id uuid, _org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
    where user_id = _user_id and org_id = _org_id
  )
$$;

create or replace function public.has_role(_user_id uuid, _org_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role = _role
      and (org_id = _org_id or _role = 'platform_admin')
  )
$$;

create or replace function public.is_platform_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = 'platform_admin'
  )
$$;

-- ===== RLS POLICIES: organizations =====
create policy "Members can view their organizations"
  on public.organizations for select to authenticated
  using (public.is_org_member(auth.uid(), id) or public.is_platform_admin(auth.uid()));

create policy "Org admins can update their organization"
  on public.organizations for update to authenticated
  using (public.has_role(auth.uid(), id, 'org_admin') or public.is_platform_admin(auth.uid()));

create policy "Platform admins can insert organizations"
  on public.organizations for insert to authenticated
  with check (public.is_platform_admin(auth.uid()));

create policy "Platform admins can delete organizations"
  on public.organizations for delete to authenticated
  using (public.is_platform_admin(auth.uid()));

-- ===== RLS POLICIES: organization_members =====
create policy "Members can view memberships of their orgs"
  on public.organization_members for select to authenticated
  using (public.is_org_member(auth.uid(), org_id) or public.is_platform_admin(auth.uid()));

create policy "Org admins can manage memberships"
  on public.organization_members for insert to authenticated
  with check (public.has_role(auth.uid(), org_id, 'org_admin') or public.is_platform_admin(auth.uid()));

create policy "Org admins can delete memberships"
  on public.organization_members for delete to authenticated
  using (public.has_role(auth.uid(), org_id, 'org_admin') or public.is_platform_admin(auth.uid()));

-- ===== RLS POLICIES: profiles =====
create policy "Users can view their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid());

create policy "Users can insert their own profile"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- ===== RLS POLICIES: user_roles =====
create policy "Users can view roles in their orgs"
  on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or (org_id is not null and public.is_org_member(auth.uid(), org_id))
    or public.is_platform_admin(auth.uid())
  );

-- ===== TRIGGER: updated_at =====
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function public.tg_set_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ===== TRIGGER: auto-provision on signup =====
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  user_name text;
  org_slug text;
begin
  user_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  -- Generate unique slug from user id
  org_slug := 'org-' || substr(replace(new.id::text, '-', ''), 1, 12);

  -- Create personal organization
  insert into public.organizations (name, slug)
  values (coalesce(user_name, 'Minha Organização') || ' Workspace', org_slug)
  returning id into new_org_id;

  -- Create profile
  insert into public.profiles (id, full_name, current_org_id)
  values (new.id, user_name, new_org_id);

  -- Add membership
  insert into public.organization_members (org_id, user_id)
  values (new_org_id, new.id);

  -- Grant org_admin role
  insert into public.user_roles (user_id, org_id, role)
  values (new.id, new_org_id, 'org_admin');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
