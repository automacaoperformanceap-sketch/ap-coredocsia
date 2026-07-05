import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const roleEnum = z.enum(["org_admin", "operator", "viewer"]);

const inviteSchema = z.object({
  email: z.string().email(),
  fullName: z.string().trim().min(1).max(150),
  password: z.string().min(6).max(72),
  role: roleEnum,
  companyId: z.string().uuid(),
  documentTypeIds: z.array(z.string().uuid()).min(1),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(150),
  role: roleEnum,
  companyId: z.string().uuid(),
  documentTypeIds: z.array(z.string().uuid()).min(1),
});

async function resolveOrgId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.current_org_id) throw new Error("Organização atual não definida");
  return data.current_org_id;
}

/** Creates (or reuses) a user and grants access. */
export const inviteUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveOrgId(supabase, userId);

    const { data: company } = await supabase
      .from("companies")
      .select("id, org_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (!company || company.org_id !== orgId) throw new Error("Empresa inválida");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let targetUserId: string | null = null;
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw new Error(list.error.message);
    const found = list.data.users.find(
      (u) => u.email?.toLowerCase() === data.email.toLowerCase(),
    );
    if (found) {
      targetUserId = found.id;
    } else {
      const created = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName, must_change_password: true },
      });
      if (created.error || !created.data.user) {
        throw new Error(created.error?.message ?? "Falha ao criar usuário");
      }
      targetUserId = created.data.user.id;
    }

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: targetUserId, full_name: data.fullName, current_org_id: orgId },
        { onConflict: "id" },
      );

    await supabaseAdmin
      .from("organization_members")
      .upsert({ org_id: orgId, user_id: targetUserId }, { onConflict: "org_id,user_id" });

    // Replace this user's role in the current org with the selected one.
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", targetUserId!)
      .eq("org_id", orgId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: targetUserId!, org_id: orgId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    const rows = data.documentTypeIds.map((dt) => ({
      org_id: orgId,
      user_id: targetUserId!,
      company_id: data.companyId,
      document_type_id: dt,
    }));
    const { error: insertErr } = await supabaseAdmin
      .from("user_document_access")
      .upsert(rows, { onConflict: "user_id,company_id,document_type_id" });
    if (insertErr) throw new Error(insertErr.message);

    return { userId: targetUserId, granted: rows.length };
  });

/** Updates a user's profile name and replaces document type access for a company. */
export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveOrgId(supabase, userId);

    const { data: company } = await supabase
      .from("companies")
      .select("id, org_id")
      .eq("id", data.companyId)
      .maybeSingle();
    if (!company || company.org_id !== orgId) throw new Error("Empresa inválida");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: data.userId, full_name: data.fullName },
        { onConflict: "id" },
      );

    // Replace role for this org.
    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId)
      .eq("org_id", orgId);
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, org_id: orgId, role: data.role });
    if (roleErr) throw new Error(roleErr.message);

    // Replace access: delete current and insert new set.
    const { error: delErr } = await supabaseAdmin
      .from("user_document_access")
      .delete()
      .eq("user_id", data.userId)
      .eq("company_id", data.companyId)
      .eq("org_id", orgId);
    if (delErr) throw new Error(delErr.message);

    const rows = data.documentTypeIds.map((dt) => ({
      org_id: orgId,
      user_id: data.userId,
      company_id: data.companyId,
      document_type_id: dt,
    }));
    const { error: insErr } = await supabaseAdmin
      .from("user_document_access")
      .insert(rows);
    if (insErr) throw new Error(insErr.message);

    return { granted: rows.length };
  });

/** Lists access grouped by (user, company) with profile name & email for the current org. */
export const listOrgUserAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveOrgId(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("user_document_access")
      .select(
        "id, user_id, company_id, document_type_id, companies(name), document_types(name)",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const profilesById = new Map<
      string,
      { fullName: string; email: string | null; suspended: boolean }
    >();

    if (userIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) =>
        profilesById.set(p.id, { fullName: p.full_name ?? "—", email: null, suspended: false }),
      );

      // Augment with auth emails + suspension status.
      const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (!list.error) {
        list.data.users.forEach((u) => {
          if (userIds.includes(u.id)) {
            const cur = profilesById.get(u.id) ?? { fullName: "—", email: null, suspended: false };
            const banned = (u as any).banned_until;
            const isSuspended = !!banned && new Date(banned).getTime() > Date.now();
            profilesById.set(u.id, { ...cur, email: u.email ?? null, suspended: isSuspended });
          }
        });
      }
    }

    // Fetch roles per user for this org.
    const rolesByUser = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: rs } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .eq("org_id", orgId)
        .in("user_id", userIds);
      (rs ?? []).forEach((r: any) => rolesByUser.set(r.user_id, r.role));
    }

    return (rows ?? []).map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      company_id: r.company_id,
      document_type_id: r.document_type_id,
      company_name: r.companies?.name ?? "—",
      document_type_name: r.document_types?.name ?? "—",
      full_name: profilesById.get(r.user_id)?.fullName ?? "—",
      email: profilesById.get(r.user_id)?.email ?? null,
      suspended: profilesById.get(r.user_id)?.suspended ?? false,
      role: rolesByUser.get(r.user_id) ?? "viewer",
    }));
  });

const userActionSchema = z.object({ userId: z.string().uuid() });
const setSuspendSchema = z.object({
  userId: z.string().uuid(),
  suspend: z.boolean(),
});

/** Deletes a user from auth + revokes all access in current org. */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => userActionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveOrgId(supabase, userId);
    if (data.userId === userId) throw new Error("Você não pode excluir o próprio usuário");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("user_document_access")
      .delete()
      .eq("user_id", data.userId)
      .eq("org_id", orgId);

    await supabaseAdmin
      .from("organization_members")
      .delete()
      .eq("user_id", data.userId)
      .eq("org_id", orgId);

    const del = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (del.error) throw new Error(del.error.message);

    return { ok: true };
  });

/** Suspends (bans) or reactivates a user. */
export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => setSuspendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.userId === userId) throw new Error("Você não pode suspender o próprio usuário");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const res = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.suspend ? "876000h" : "none",
    } as any);
    if (res.error) throw new Error(res.error.message);
    return { ok: true, suspended: data.suspend };
  });

/** Returns the set of suspended user ids among the given ids. */
export const listSuspendedUserIds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userIds: string[] }) =>
    z.object({ userIds: z.array(z.string().uuid()) }).parse(data),
  )
  .handler(async ({ data }) => {
    if (data.userIds.length === 0) return { suspended: [] as string[] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (list.error) throw new Error(list.error.message);
    const set = new Set(data.userIds);
    const suspended = list.data.users
      .filter((u) => set.has(u.id) && (u as any).banned_until)
      .filter((u) => new Date((u as any).banned_until).getTime() > Date.now())
      .map((u) => u.id);
    return { suspended };
  });
