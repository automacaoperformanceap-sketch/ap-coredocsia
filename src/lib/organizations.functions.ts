import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface EnsureCurrentOrganizationResult {
  orgId: string;
}

function getWorkspaceName(email?: string | null): string {
  const fallbackName = email?.split("@")[0]?.trim();
  return `${fallbackName || "Minha Organização"} Workspace`;
}

function getWorkspaceSlug(userId: string): string {
  const compactUserId = userId.replaceAll("-", "").slice(0, 12);
  return `org-${compactUserId}-${Date.now().toString(36)}`;
}

export const ensureCurrentOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<EnsureCurrentOrganizationResult> => {
    const { userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("current_org_id, full_name")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);

    if (profile?.current_org_id) {
      const { data: existingMembership, error: membershipError } = await supabaseAdmin
        .from("organization_members")
        .select("org_id")
        .eq("user_id", userId)
        .eq("org_id", profile.current_org_id)
        .maybeSingle();

      if (membershipError) throw new Error(membershipError.message);
      if (existingMembership?.org_id) return { orgId: existingMembership.org_id };
    }

    const { data: firstMembership, error: firstMembershipError } = await supabaseAdmin
      .from("organization_members")
      .select("org_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (firstMembershipError) throw new Error(firstMembershipError.message);

    if (firstMembership?.org_id) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, current_org_id: firstMembership.org_id }, { onConflict: "id" });
      return { orgId: firstMembership.org_id };
    }

    const email = typeof claims.email === "string" ? claims.email : null;
    const organizationName = profile?.full_name
      ? `${profile.full_name} Workspace`
      : getWorkspaceName(email);

    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: organizationName, slug: getWorkspaceSlug(userId) })
      .select("id")
      .single();

    if (organizationError || !organization) {
      throw new Error(organizationError?.message ?? "Falha ao criar organização");
    }

    const { error: profileUpsertError } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, current_org_id: organization.id }, { onConflict: "id" });
    if (profileUpsertError) throw new Error(profileUpsertError.message);

    const { error: membershipInsertError } = await supabaseAdmin
      .from("organization_members")
      .upsert({ org_id: organization.id, user_id: userId }, { onConflict: "org_id,user_id" });
    if (membershipInsertError) throw new Error(membershipInsertError.message);

    const { error: roleInsertError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        { org_id: organization.id, role: "org_admin", user_id: userId },
        { onConflict: "user_id,org_id,role" },
      );
    if (roleInsertError) throw new Error(roleInsertError.message);

    return { orgId: organization.id };
  });