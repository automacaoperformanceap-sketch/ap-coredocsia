import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server functions que executam as RPCs SECURITY DEFINER de manipulação
 * de tabelas físicas por tipo de documento. As RPCs perderam EXECUTE do
 * papel `authenticated` no hardening de segurança, então precisam ser
 * chamadas via supabaseAdmin (service_role) a partir do servidor, após
 * validar que o usuário é membro da organização do tipo.
 */

async function assertMemberOfType(typeId: string, userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: dt, error } = await supabaseAdmin
    .from("document_types")
    .select("org_id")
    .eq("id", typeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!dt) throw new Error("Tipo de documento não encontrado");
  const { data: member, error: mErr } = await supabaseAdmin
    .from("organization_members")
    .select("user_id")
    .eq("org_id", dt.org_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!member) throw new Error("Sem permissão nesta organização");
  return { supabaseAdmin, orgId: dt.org_id };
}

export const createDocTypeTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = data as { typeId?: string };
    if (!d?.typeId || typeof d.typeId !== "string") throw new Error("typeId obrigatório");
    return { typeId: d.typeId };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await assertMemberOfType(data.typeId, context.userId!);
    const { data: table, error } = await supabaseAdmin.rpc("create_doc_type_table", {
      _type_id: data.typeId,
    });
    if (error) throw new Error(error.message);
    return { table };
  });

export const addDocTypeColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = data as { typeId?: string; fieldKey?: string; fieldType?: string };
    if (!d?.typeId || !d?.fieldKey || !d?.fieldType) throw new Error("parâmetros inválidos");
    return { typeId: d.typeId, fieldKey: d.fieldKey, fieldType: d.fieldType };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await assertMemberOfType(data.typeId, context.userId!);
    const { error } = await supabaseAdmin.rpc("add_doc_type_column", {
      _type_id: data.typeId,
      _field_key: data.fieldKey,
      _field_type: data.fieldType,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dropDocTypeColumn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = data as { typeId?: string; fieldKey?: string };
    if (!d?.typeId || !d?.fieldKey) throw new Error("parâmetros inválidos");
    return { typeId: d.typeId, fieldKey: d.fieldKey };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await assertMemberOfType(data.typeId, context.userId!);
    const { error } = await supabaseAdmin.rpc("drop_doc_type_column", {
      _type_id: data.typeId,
      _field_key: data.fieldKey,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertDocTypeRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    const d = data as { typeId?: string; documentId?: string; values?: Record<string, unknown> };
    if (!d?.typeId || !d?.documentId) throw new Error("parâmetros inválidos");
    return { typeId: d.typeId, documentId: d.documentId, values: d.values ?? {} };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await assertMemberOfType(data.typeId, context.userId!);
    const { error } = await supabaseAdmin.rpc("upsert_doc_type_row", {
      _type_id: data.typeId,
      _document_id: data.documentId,
      _values: data.values as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

