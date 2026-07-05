import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DocTypeField {
  id: string;
  document_type_id: string;
  label: string;
  field_key: string;
  field_type: string;
  required: boolean;
  position: number;
  options: any;
  is_lookup_key?: boolean;
  expected_length?: number | null;
  location_hint?: string | null;
}


export function useDocumentTypeFields(documentTypeId: string | null | undefined) {
  return useQuery({
    queryKey: ["document-type-fields", documentTypeId],
    enabled: !!documentTypeId,
    queryFn: async (): Promise<DocTypeField[]> => {
      const { data, error } = await supabase
        .from("document_type_fields")
        .select("*")
        .eq("document_type_id", documentTypeId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as DocTypeField[];
    },
  });
}
