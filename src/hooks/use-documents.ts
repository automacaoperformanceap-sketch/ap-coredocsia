import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocStatus, DocumentRow } from "@/lib/documents";

export interface ListDocumentsParams {
  orgId: string | null | undefined;
  status?: DocStatus | "all";
  typeId?: string | "all";
  search?: string;
  includeDeleted?: boolean;
  allowedTypeIds?: string[] | null;
}

export function useDocumentsList(params: ListDocumentsParams) {
  const queryClient = useQueryClient();
  const {
    orgId,
    status = "all",
    typeId = "all",
    search = "",
    includeDeleted = false,
    allowedTypeIds = null,
  } = params;

  const query = useQuery({
    queryKey: ["documents", orgId, status, typeId, search, includeDeleted, allowedTypeIds],
    enabled: !!orgId,
    queryFn: async (): Promise<DocumentRow[]> => {
      if (allowedTypeIds && allowedTypeIds.length === 0) return [];

      const buildQuery = () => {
        let q = supabase
          .from("documents")
          .select("*")
          .eq("org_id", orgId!)
          .order("created_at", { ascending: false });

        if (!includeDeleted) q = q.is("deleted_at", null);
        if (status !== "all") q = q.eq("status", status);
        if (typeId !== "all") q = q.eq("document_type_id", typeId);
        if (allowedTypeIds && allowedTypeIds.length > 0) {
          q = q.in("document_type_id", allowedTypeIds);
        }
        if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
        return q;
      };

      // Pagina via cursor em created_at para contornar o teto de max-rows do PostgREST
      const PAGE = 1000;
      const all: DocumentRow[] = [];
      let cursor: string | null = null;
      while (true) {
        let q = buildQuery().limit(PAGE);
        if (cursor) q = q.lt("created_at", cursor);
        const { data, error } = await q;
        if (error) throw error;
        const rows = data ?? [];
        all.push(...rows);
        if (rows.length < PAGE) break;
        cursor = rows[rows.length - 1].created_at as string;
      }
      return all;
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`documents:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `org_id=eq.${orgId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["documents"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  return query;
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: ["document", id],
    enabled: !!id,
    queryFn: async (): Promise<DocumentRow | null> => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
