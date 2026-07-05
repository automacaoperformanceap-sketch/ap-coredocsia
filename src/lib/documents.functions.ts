import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface UpdateItem {
  id: string;
  field_values: Record<string, unknown>;
  name?: string;
  tags?: string[];
}

export const updateDocumentsFromImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("payload inválido");
    const { updates } = data as { updates?: UpdateItem[] };
    if (!Array.isArray(updates) || updates.length === 0) throw new Error("nenhum registro");
    for (const u of updates) {
      if (!u || typeof u.id !== "string") throw new Error("id ausente");
      if (!u.field_values || typeof u.field_values !== "object")
        throw new Error("field_values inválido");
    }
    return { updates };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!userId) throw new Error("não autenticado");
    let updated = 0;
    const errors: { id: string; error: string }[] = [];

    for (const u of data.updates) {
      // Lê documento atual (RLS garante acesso ao org).
      const { data: doc, error: fetchErr } = await supabase
        .from("documents")
        .select("id, document_type_id, field_values")
        .eq("id", u.id)
        .maybeSingle();
      if (fetchErr || !doc) {
        errors.push({ id: u.id, error: fetchErr?.message ?? "não encontrado" });
        continue;
      }

      const merged = {
        ...((doc.field_values as Record<string, unknown>) ?? {}),
        ...u.field_values,
      };

      const patch: Record<string, unknown> = {
        field_values: merged,
        last_edited_by: userId,
      };
      if (u.name && u.name.trim()) patch.name = u.name.trim();
      if (Array.isArray(u.tags)) patch.tags = u.tags;

      const { error: updErr } = await supabase
        .from("documents")
        .update(patch as never)
        .eq("id", u.id);
      if (updErr) {
        errors.push({ id: u.id, error: updErr.message });
        continue;
      }

      // Replica na tabela física do tipo (no-op para tipos sem storage_table).
      if (doc.document_type_id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.rpc("upsert_doc_type_row", {
          _type_id: doc.document_type_id,
          _document_id: u.id,
          _values: merged as never,
        });
      }


      updated += 1;
    }

    return { updated, errors };
  });
