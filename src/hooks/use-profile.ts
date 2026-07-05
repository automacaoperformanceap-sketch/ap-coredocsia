import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

export type AppRole = "platform_admin" | "org_admin" | "operator" | "viewer";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface ProfileBundle {
  profile: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    current_org_id: string | null;
  };
  organizations: Organization[];
  currentOrg: Organization | null;
  roles: AppRole[];
  isPlatformAdmin: boolean;
}

export function useProfileBundle() {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery<ProfileBundle | null>({
    queryKey: ["profile-bundle", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const [profileRes, membersRes, rolesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase
          .from("organization_members")
          .select("org_id, organizations(id, name, slug)")
          .eq("user_id", user.id),
        supabase.from("user_roles").select("role, org_id").eq("user_id", user.id),
      ]);

      const profile = profileRes.data ?? {
        id: user.id,
        full_name: null,
        avatar_url: null,
        current_org_id: null,
      };
      const organizations: Organization[] =
        (membersRes.data ?? [])
          .map((m: any) => m.organizations)
          .filter(Boolean) as Organization[];

      const currentOrg =
        organizations.find((o) => o.id === profile.current_org_id) ??
        organizations[0] ??
        null;

      const rolesAll = (rolesRes.data ?? []) as { role: AppRole; org_id: string | null }[];
      const isPlatformAdmin = rolesAll.some((r) => r.role === "platform_admin");
      const orgRoles = currentOrg
        ? rolesAll.filter((r) => r.org_id === currentOrg.id).map((r) => r.role)
        : [];

      return {
        profile,
        organizations,
        currentOrg,
        roles: orgRoles,
        isPlatformAdmin,
      };
    },
  });

  return { ...query, loading: authLoading || query.isLoading };
}
