import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Sparkles,
  TrendingUp,
  FileText,
  Building2,
  AlertCircle,
  Download,
  Trash2,
  Timer,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useProfileBundle } from "@/hooks/use-profile";



export const Route = createFileRoute("/_authenticated/audit")({
  component: AuditPage,
});

interface AiLogRow {
  id: string;
  created_at: string;
  company_name: string | null;
  document_type_name: string | null;
  file_name: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_brl: number | null;
  duration_ms: number | null;
  corrected_chars: number | null;
  extracted_chars: number | null;
  success: boolean;
  error_message: string | null;
}

interface AuditStats {
  totals: {
    files: number;
    success: number;
    failed: number;
    prompt: number;
    completion: number;
    total: number;
    cost: number;
    duration_count: number;
    duration_total: number;
    accuracy_sum: number;
    accuracy_count: number;
  };
  byCompany: Array<{ id: string | null; name: string; files: number; tokens: number; cost: number }>;
  companies: Array<{ id: string; name: string }>;
  docTypes: Array<{ id: string; name: string }>;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}m ${r}s`;
}

function exportLogsXlsx(rows: AiLogRow[]) {
  const headers = [
    "Data",
    "Empresa",
    "Tipo",
    "Arquivo",
    "Modelo",
    "Prompt tokens",
    "Completion tokens",
    "Total tokens",
    "Custo (R$)",
    "Tempo IA",
    "Caracteres extraídos",
    "% Acerto",
    "Status",
    "Erro",
  ];
  const data = rows.map((l) => [
    formatDateTime(l.created_at),
    l.company_name ?? "",
    l.document_type_name ?? "",
    l.file_name,
    l.model === "gemini-2.5-flash-lite"
      ? "2.5 Flash Lite"
      : l.model === "claude-haiku-4-5-20251001"
        ? "Haiku 4.5"
        : l.model,
    l.prompt_tokens,
    l.completion_tokens,
    l.total_tokens,
    l.cost_brl != null ? Number(l.cost_brl.toFixed(4)) : "",
    l.duration_ms != null ? formatDuration(l.duration_ms) : "",
    l.extracted_chars ?? 0,
    l.extracted_chars && l.extracted_chars > 0
      ? Number(((Math.max(0, l.extracted_chars - (l.corrected_chars ?? 0)) / l.extracted_chars) * 100).toFixed(2)) / 100
      : "",
    l.success ? "OK" : "Falha",
    l.error_message ?? "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  for (let i = 0; i < data.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: 11 })];
    if (cell && typeof cell.v === "number") cell.z = "0%";
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Auditoria IA");
  XLSX.writeFile(wb, `auditoria-ia-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

const DETAIL_COLS =
  "id, created_at, company_name, document_type_name, file_name, model, prompt_tokens, completion_tokens, total_tokens, cost_brl, duration_ms, corrected_chars, extracted_chars, success, error_message";

function AuditPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("__all__");
  const [docTypeFilter, setDocTypeFilter] = useState<string>("__all__");
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<AiLogRow | null>(null);

  const PAGE_SIZE = 10;
  const queryClient = useQueryClient();

  const companyParam = companyFilter === "__all__" ? null : companyFilter;
  const docTypeParam = docTypeFilter === "__all__" ? null : docTypeFilter;
  const detailsReady = companyParam !== null && docTypeParam !== null;

  // Stats agregadas via RPC — sempre 1 chamada leve.
  const { data: stats, isLoading: statsLoading, isFetching: statsFetching, refetch: refetchStats } = useQuery({
    queryKey: ["audit-stats", orgId, companyParam, docTypeParam],
    enabled: !!orgId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AuditStats> => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)("get_audit_stats", {
        _org_id: orgId!,
        _company_id: companyParam,
        _doc_type_id: docTypeParam,
      });
      if (error) throw error;
      return data as AuditStats;
    },

  });

  // Detalhes paginados server-side, apenas quando empresa + tipo estão selecionados.
  const { data: detailPage, isLoading: detailLoading, isFetching: detailFetching, refetch: refetchDetail } = useQuery({
    queryKey: ["audit-details", orgId, companyParam, docTypeParam, search, page],
    enabled: !!orgId && detailsReady,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: AiLogRow[]; count: number }> => {
      let q = supabase
        .from("ai_usage_logs")
        .select(DETAIL_COLS, { count: "exact" })
        .eq("org_id", orgId!)
        .eq("company_id", companyParam!)
        .eq("document_type_id", docTypeParam!)
        .order("created_at", { ascending: false });

      const term = search.trim();
      if (term) q = q.ilike("file_name", `%${term}%`);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await q.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as AiLogRow[], count: count ?? 0 };
    },
  });

  useEffect(() => {
    setPage(1);
  }, [search, companyFilter, docTypeFilter]);

  useEffect(() => {
    if (docTypeParam && stats && !stats.docTypes.some((t) => t.id === docTypeParam)) {
      setDocTypeFilter("__all__");
    }
  }, [stats, docTypeParam]);

  const totals = stats?.totals;
  const byCompany = stats?.byCompany ?? [];
  const companyOptions = stats?.companies ?? [];
  const docTypeOptions = stats?.docTypes ?? [];
  const detailRows = detailPage?.rows ?? [];
  const detailCount = detailPage?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(detailCount / PAGE_SIZE));

  const deleteLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_usage_logs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["audit-stats", orgId] });
      queryClient.invalidateQueries({ queryKey: ["audit-details", orgId] });
      toast.success("Registro excluído", {
        description: "O registro de auditoria foi removido permanentemente.",
      });
    },
    onError: (error) => {
      toast.error("Erro ao excluir", {
        description: error instanceof Error ? error.message : "Tente novamente em instantes.",
      });
    },
  });

  async function handleRefresh() {
    await Promise.all([refetchStats(), detailsReady ? refetchDetail() : Promise.resolve()]);
  }

  async function handleExport() {
    if (!orgId || !detailsReady) return;
    setIsExporting(true);
    try {
      const PAGE = 1000;
      const all: AiLogRow[] = [];
      for (let from = 0; ; from += PAGE) {
        let q = supabase
          .from("ai_usage_logs")
          .select(DETAIL_COLS)
          .eq("org_id", orgId)
          .eq("company_id", companyParam!)
          .eq("document_type_id", docTypeParam!)
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        const term = search.trim();
        if (term) q = q.ilike("file_name", `%${term}%`);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data ?? []) as AiLogRow[];
        all.push(...rows);
        if (rows.length < PAGE) break;
      }
      exportLogsXlsx(all);
    } catch (err) {
      toast.error("Erro ao exportar", {
        description: err instanceof Error ? err.message : "Tente novamente em instantes.",
      });
    } finally {
      setIsExporting(false);
    }
  }

  const isFetching = statsFetching || detailFetching;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-800" />
            Painel de uso de IA
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Auditoria de IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Log de uso da indexação por IA: empresa, tipo de documento, arquivo e tokens consumidos
            em cada processamento. Use o somatório para cobrança futura.
          </p>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-2.5 border-0 bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <FileText className="absolute right-0 h-3.5 w-3.5" />
            <span>Arquivos processados</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">{(totals?.files ?? 0).toLocaleString("pt-BR")}</div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {totals?.success ?? 0} sucesso · {totals?.failed ?? 0} falha
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Sparkles className="absolute right-0 h-3.5 w-3.5" />
            <span>Custo total</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            R$ {Number(totals?.cost ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            Média R$ {((totals?.files ?? 0) > 0 ? Number(totals!.cost) / totals!.files : 0).toFixed(2).replace(".", ",")} por arquivo
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-slate-700 to-blue-900 text-white shadow-lg shadow-slate-700/20 hover:shadow-slate-700/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <TrendingUp className="absolute right-0 h-3.5 w-3.5" />
            <span>Tokens totais</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">{Number(totals?.total ?? 0).toLocaleString("pt-BR")}</div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {Number(totals?.prompt ?? 0).toLocaleString("pt-BR")} prompt · {Number(totals?.completion ?? 0).toLocaleString("pt-BR")} compl.
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Timer className="absolute right-0 h-3.5 w-3.5" />
            <span>Tempo médio IA</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {totals && totals.duration_count > 0
              ? formatDuration(Math.round(Number(totals.duration_total) / totals.duration_count))
              : "—"}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {totals?.duration_count ?? 0} medições
          </div>
        </Card>
        <Card className="p-2.5 border-0 bg-gradient-to-br from-cyan-700 to-sky-800 text-white shadow-lg shadow-cyan-700/20 hover:shadow-cyan-700/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Sparkles className="absolute right-0 h-3.5 w-3.5" />
            <span>% Acerto médio</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {totals && totals.accuracy_count > 0
              ? `${Math.trunc(Number(totals.accuracy_sum) / totals.accuracy_count)}%`
              : "—"}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            Média de {totals?.accuracy_count ?? 0} arquivo{(totals?.accuracy_count ?? 0) === 1 ? "" : "s"}
          </div>
        </Card>
      </div>

      {byCompany.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Somatório por empresa</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Arquivos</TableHead>
                  <TableHead className="text-right">Custo (R$)</TableHead>
                  <TableHead className="text-right">Tokens totais</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCompany.map((v) => (
                  <TableRow key={v.id ?? v.name}>
                    <TableCell className="font-medium">{v.name}</TableCell>
                    <TableCell className="text-right">{v.files}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      R$ {Number(v.cost).toFixed(2).replace(".", ",")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(v.tokens).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="p-3 space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
          <h3 className="font-semibold text-sm truncate">Detalhes por arquivo</h3>
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as empresas</SelectItem>
                {companyOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
              <SelectTrigger className="h-8 w-[170px] text-xs">
                <SelectValue placeholder="Tipo de documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os tipos</SelectItem>
                {docTypeOptions.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar por arquivo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 max-w-[220px] text-xs"
            />
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-8"
              disabled={companyFilter === "__all__" && docTypeFilter === "__all__" && search === ""}
              onClick={() => {
                setCompanyFilter("__all__");
                setDocTypeFilter("__all__");
                setSearch("");
              }}
            >
              <X className="h-4 w-4" /> Limpar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={!detailsReady || detailCount === 0 || isExporting}
              onClick={handleExport}
            >
              <Download className="h-4 w-4" /> {isExporting ? "Exportando…" : "Exportar XLSX"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={isFetching}
              onClick={handleRefresh}
              title="Atualizar dados"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {!detailsReady ? (
          <p className="text-sm text-muted-foreground">
            Selecione uma <strong>empresa</strong> e um <strong>tipo de documento</strong> para exibir os detalhes por arquivo.
          </p>
        ) : detailLoading || statsLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : detailRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma indexação por IA registrada para os filtros selecionados.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-3 px-3">
            <Table className="text-xs [&_th]:h-9 [&_th]:px-2 [&_th]:text-[11px] [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-center [&_td]:px-2 [&_td]:py-2 [&_td]:align-middle [&_td]:text-center">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="!px-1">Tokens</TableHead>
                  <TableHead className="!px-1">Custo</TableHead>
                  <TableHead className="!px-1">Tempo</TableHead>
                  <TableHead className="!px-1">Caract. Extr.</TableHead>
                  <TableHead className="!px-1">% Acerto</TableHead>
                  <TableHead className="!px-1">Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(l.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[140px] truncate" title={l.company_name ?? ""}>
                      {l.company_name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate" title={l.document_type_name ?? ""}>
                      {l.document_type_name ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate !text-left" title={l.file_name}>
                      {l.file_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {l.model === "gemini-2.5-flash-lite"
                        ? "2.5 Flash Lite"
                        : l.model === "claude-haiku-4-5-20251001"
                          ? "Haiku 4.5"
                          : l.model}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums font-medium whitespace-nowrap">
                      {l.total_tokens.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums whitespace-nowrap">
                      {l.cost_brl != null
                        ? `R$ ${l.cost_brl.toFixed(2).replace(".", ",")}`
                        : "—"}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {l.duration_ms != null ? formatDuration(l.duration_ms) : "—"}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {(l.extracted_chars ?? 0).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="!px-1 text-right tabular-nums text-muted-foreground whitespace-nowrap">
                      {l.extracted_chars && l.extracted_chars > 0
                        ? `${Math.trunc((Math.max(0, l.extracted_chars - (l.corrected_chars ?? 0)) / l.extracted_chars) * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="!px-1">
                      {l.success ? (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">OK</Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1 px-1.5 py-0 text-[10px]">
                          <AlertCircle className="h-3 w-3" />
                          Falha
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        aria-label="Excluir registro"
                        disabled={deleteLog.isPending && deleteLog.variables === l.id}
                        onClick={() => setRowToDelete(l)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

              </TableBody>
            </Table>
            {detailCount > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, detailCount)} de {detailCount}
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
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page} / {totalPages}
                  </span>
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
          </div>
        )}
      </Card>

      <AlertDialog open={!!rowToDelete} onOpenChange={(o) => !o && setRowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro de auditoria?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Você está prestes a excluir permanentemente o seguinte registro de uso de IA.
                  Esta ação <strong>não pode ser desfeita</strong>.
                </p>
                {rowToDelete && (
                  <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1 text-xs">
                    <div><span className="text-muted-foreground">Arquivo:</span> <strong>{rowToDelete.file_name}</strong></div>
                    <div><span className="text-muted-foreground">Empresa:</span> {rowToDelete.company_name ?? "—"}</div>
                    <div><span className="text-muted-foreground">Tipo:</span> {rowToDelete.document_type_name ?? "—"}</div>
                    <div><span className="text-muted-foreground">Data:</span> {formatDateTime(rowToDelete.created_at)}</div>
                    <div>
                      <span className="text-muted-foreground">Tokens:</span>{" "}
                      {rowToDelete.total_tokens.toLocaleString("pt-BR")}
                      {rowToDelete.cost_brl != null && (
                        <> · <span className="text-muted-foreground">Custo:</span> R$ {rowToDelete.cost_brl.toFixed(2).replace(".", ",")}</>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (rowToDelete) {
                  deleteLog.mutate(rowToDelete.id);
                  setRowToDelete(null);
                }
              }}
            >
              Confirmar exclusão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>

  );
}
