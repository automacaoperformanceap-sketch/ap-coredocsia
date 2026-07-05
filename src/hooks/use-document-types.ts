import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentTypeRow } from "@/lib/documents";

export function useDocumentTypes(orgId: string | null | undefined) {
  return useQuery({
    queryKey: ["document-types", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<DocumentTypeRow[]> => {
      const { data, error } = await supabase
        .from("document_types")
        .select("*")
        .eq("org_id", orgId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
