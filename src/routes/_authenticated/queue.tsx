import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, ChevronLeft, ChevronRight, ListChecks, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { useProfileBundle } from "@/hooks/use-profile";
import { formatBytes, type DocStatus, type DocumentRow } from "@/lib/documents";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/queue")({
  component: QueuePage,
});

type QueueDoc = DocumentRow & {
  ai_usage_logs?: { id: string; duration_ms: number | null }[];
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}
type QueueStatus = DocStatus | "processed_ai" | "processed_manual" | "all";

function QueuePage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const isAdmin = profile?.roles.includes("org_admin") || profile?.isPlatformAdmin;
  const [status, setStatus] = useState<QueueStatus>("all");
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const queryClient = useQueryClient();

  const {
    data: docs = [],
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["queue-documents", orgId, status],
    enabled: !!orgId,
    queryFn: async (): Promise<QueueDoc[]> => {
      const buildQuery = () => {
        let q = supabase
          .from("documents")
          .select("*, ai_usage_logs(id, duration_ms)")
          .eq("org_id", orgId!)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });

        if (status === "pending") q = q.eq("status", "pending");
        else if (status === "processing") q = q.eq("status", "processing");
        else if (status === "failed") q = q.eq("status", "failed");
        else if (
          status === "processed" ||
          status === "processed_ai" ||
          status === "processed_manual"
        ) {
          q = q.eq("status", "processed");
        }
        return q;
      };

      const PAGE = 1000;
      const all: QueueDoc[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = (data ?? []) as QueueDoc[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      if (status === "processed_ai") {
        return all.filter((d) => (d.ai_usage_logs?.length ?? 0) > 0);
      }
      if (status === "processed_manual") {
        return all.filter((d) => (d.ai_usage_logs?.length ?? 0) === 0);
      }
      return all;

    },
  });

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`queue-documents:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "documents", filter: `org_id=eq.${orgId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["queue-documents"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const totalPages = Math.max(1, Math.ceil(docs.length / pageSize));
  const paginatedDocs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return docs.slice(start, start + pageSize);
  }, [docs, page]);

  const counts = useMemo(() => {
    const c = {
      pending: 0,
      processing: 0,
      processed: 0,
      processed_ai: 0,
      processed_manual: 0,
      failed: 0,
    };
    docs.forEach((d) => {
      if (d.status === "processed") {
        const hasAi = (d.ai_usage_logs?.length ?? 0) > 0;
        if (hasAi) c.processed_ai++;
        else c.processed_manual++;
      } else {
        c[d.status]++;
      }
    });
    return c;
  }, [docs]);

  async function reprocess(id: string) {
    const { error } = await supabase
      .from("documents")
      .update({ status: "pending", error_message: null })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Reprocessamento agendado");
    queryClient.invalidateQueries({ queryKey: ["queue-documents"] });
  }

  async function remove(id: string) {
    if (!confirm("Excluir este documento?")) return;
    const { error } = await supabase
      .from("documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else toast.success("Documento removido");
    queryClient.invalidateQueries({ queryKey: ["queue-documents"] });
  }

  const statCards = [
    {
      label: "Pendente",
      value: counts.pending,
      icon: ListChecks,
      gradient: "from-amber-500 to-orange-600",
      shadow: "shadow-amber-500/20 hover:shadow-amber-500/40",
      status: "pending" as QueueStatus,
      spin: false,
    },
    {
      label: "Processando",
      value: counts.processing,
      icon: RefreshCw,
      gradient: "from-sky-500 to-blue-600",
      shadow: "shadow-sky-500/20 hover:shadow-sky-500/40",
      status: "processing" as QueueStatus,
      spin: counts.processing > 0,
    },
    {
      label: "Processado IA",
      value: counts.processed_ai,
      icon: Sparkles,
      gradient: "from-slate-700 to-blue-900",
      shadow: "shadow-slate-700/20 hover:shadow-slate-700/40",
      status: "processed_ai" as QueueStatus,
      spin: false,
    },
    {
      label: "Indexação Manual",
      value: counts.processed_manual,
      icon: CheckCircle2,
      gradient: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-500/20 hover:shadow-emerald-500/40",
      status: "processed_manual" as QueueStatus,
      spin: false,
    },
    {
      label: "Falhou",
      value: counts.failed,
      icon: Trash2,
      gradient: "from-rose-500 to-red-600",
      shadow: "shadow-rose-500/20 hover:shadow-rose-500/40",
      status: "failed" as QueueStatus,
      spin: false,
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
              <ListChecks className="h-3.5 w-3.5 text-blue-800" />
              Tempo real
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
              Fila de processamento
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Acompanhe o status dos documentos em tempo real.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="bg-background/60 backdrop-blur"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((s) => {
          const isActive = status === s.status;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => setStatus(isActive ? "all" : s.status)}
              className={`rounded-xl p-2.5 border-0 bg-gradient-to-br ${s.gradient} text-white shadow-lg ${s.shadow} hover:-translate-y-0.5 transition-all ${isActive ? "ring-2 ring-white/70 ring-offset-2 ring-offset-background" : ""}`}
            >
              <div className="relative flex items-center justify-center">
                <span className="text-[11px] font-medium text-white/85 uppercase tracking-wider">
                  {s.label}
                </span>
                <s.icon className={`absolute right-0 h-3.5 w-3.5 text-white/90 ${s.spin ? "animate-spin" : ""}`} />
              </div>
              <p className="text-2xl font-display font-bold mt-1 tabular-nums leading-tight text-center">{s.value}</p>
            </button>

          );
        })}
      </div>


      <Card>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as QueueStatus)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="processing">Processando</SelectItem>
              <SelectItem value="processed_ai">Processado IA</SelectItem>
              <SelectItem value="processed_manual">Indexação Manual</SelectItem>
              <SelectItem value="processed">Processado (todos)</SelectItem>
              <SelectItem value="failed">Falhou</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tamanho</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tempo IA</TableHead>
              <TableHead>Enviado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && docs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Nenhum documento na fila.
                </TableCell>
              </TableRow>
            )}
            {paginatedDocs.map((doc) => {
              const durationMs = doc.ai_usage_logs?.[0]?.duration_ms ?? null;
              return (
              <TableRow key={doc.id}>
                <TableCell className="font-medium max-w-[300px] truncate">
                  {doc.name}
                  {doc.error_message && (
                    <p className="text-xs text-destructive font-normal mt-0.5">
                      {doc.error_message}
                    </p>
                  )}
                </TableCell>
                <TableCell>{formatBytes(Number(doc.size_bytes))}</TableCell>
                <TableCell>
                  <StatusBadge status={doc.status} />
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {durationMs != null ? formatDuration(durationMs) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(doc.created_at), "dd/MM/yyyy HH:mm", {
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  {doc.status === "failed" && (
                    <Button size="sm" variant="ghost" onClick={() => reprocess(doc.id)}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reprocessar
                    </Button>
                  )}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(doc.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );})}
          </TableBody>
        </Table>
        {docs.length > pageSize && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages} · {docs.length} registros
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
