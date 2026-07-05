
revoke execute on function public.is_org_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_role(uuid, uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.is_platform_admin(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;
