import { supabase } from "@/integrations/supabase/client";

export function normalizeLookupKey(raw: string): string {
  return (raw ?? "").toString().trim().toUpperCase();
}

export async function lookupByKey(
  documentTypeId: string,
  rawKey: string,
): Promise<Record<string, string> | null> {
  const key = normalizeLookupKey(rawKey);
  if (!key) return null;
  const { data, error } = await supabase
    .from("document_type_lookups")
    .select("values")
    .eq("document_type_id", documentTypeId)
    .eq("key_value", key)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const values = (data.values ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}
