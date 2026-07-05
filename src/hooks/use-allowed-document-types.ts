import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";
import { useProfileBundle } from "./use-profile";

/**
 * Returns the set of document_type_ids the current user is allowed to see
 * in the current org. Returns `null` for users with no restriction
 * (org_admin or platform_admin) — meaning "all types".
 */
export function useAllowedDocumentTypeIds() {
  const { user } = useAuth();
  const { data: profile, loading } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const isUnrestricted =
    !!profile && (profile.isPlatformAdmin || profile.roles.includes("org_admin"));

  return useQuery<string[] | null>({
    queryKey: ["allowed-doc-types", user?.id, orgId, isUnrestricted],
    enabled: !loading && !!user && !!orgId,
    queryFn: async () => {
      if (isUnrestricted) return null;
      const { data, error } = await supabase
        .from("user_document_access")
        .select("document_type_id")
        .eq("user_id", user!.id)
        .eq("org_id", orgId!);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r: any) => r.document_type_id)));
    },
  });
}
