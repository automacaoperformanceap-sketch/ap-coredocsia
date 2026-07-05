import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Upload,
  ListChecks,
  FolderOpen,
  Wallet,
  ArrowRight,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Building2,
  TrendingUp,
} from "lucide-react";

import { useProfileBundle } from "@/hooks/use-profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { DocumentRow } from "@/lib/documents";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface DashboardData {
  total: number;
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  last30: number;
  last7: number;
  aiCostMonth: number;
  aiCallsMonth: number;
  recent: DocumentRow[];
  byType: { name: string; count: number }[];
  byCompany: { name: string; count: number }[];
  companiesCount: number;
  typesCount: number;
}

function Dashboard() {
  const { data: profile, loading } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;

  const { data, isLoading } = useQuery<DashboardData | null>({
    queryKey: ["dashboard", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      if (!orgId) return null;
      const since30 = subDays(new Date(), 30).toISOString();
      const since7 = subDays(new Date(), 7).toISOString();
      const sinceMonth = new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString();

      const [recentRes, companiesRes, typesRes] = await Promise.all([
        supabase
          .from("documents")
          .select("*")
          .eq("org_id", orgId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("companies").select("id, name").eq("org_id", orgId),
        supabase.from("document_types").select("id, name").eq("org_id", orgId),
      ]);

      // Pagina ai_usage_logs por cursor — sem isso, PostgREST limita a 1000 linhas.
      const AI_PAGE = 1000;
      const aiLogs: Array<{ cost_brl: number | null; created_at: string }> = [];
      let aiCursor: string | null = null;
      while (true) {
        let aiQuery = supabase
          .from("ai_usage_logs")
          .select("cost_brl, created_at")
          .eq("org_id", orgId)
          .gte("created_at", sinceMonth)
          .order("created_at", { ascending: false })
          .limit(AI_PAGE);
        if (aiCursor) aiQuery = aiQuery.lt("created_at", aiCursor);
        const { data: aiData, error: aiErr } = await aiQuery;
        if (aiErr) throw aiErr;
        const aiRows = (aiData ?? []) as Array<{ cost_brl: number | null; created_at: string }>;
        aiLogs.push(...aiRows);
        if (aiRows.length < AI_PAGE) break;
        aiCursor = aiRows[aiRows.length - 1].created_at;
      }

      // Pagina por cursor para evitar o teto visual de 9.999 registros em consultas por range.
      const PAGE = 1000;
      const all: Array<{ id: string; status: string; created_at: string; document_type_id: string | null; company_id: string | null }> = [];
      let cursor: string | null = null;
      while (true) {
        let documentsQuery = supabase
          .from("documents")
          .select("id, status, created_at, document_type_id, company_id")
          .eq("org_id", orgId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(PAGE);

        if (cursor) documentsQuery = documentsQuery.lt("created_at", cursor);

        const { data, error } = await documentsQuery;
        if (error) throw error;
        const rows = (data ?? []) as any[];
        all.push(...rows);
        if (rows.length < PAGE) break;
        cursor = rows[rows.length - 1].created_at;
      }

      const types = typesRes.data ?? [];

      const companies = companiesRes.data ?? [];
      const typeMap = new Map(types.map((t: any) => [t.id, t.name]));
      const companyMap = new Map(companies.map((c: any) => [c.id, c.name]));

      const counts = { pending: 0, processing: 0, processed: 0, failed: 0 };
      let last30 = 0;
      let last7 = 0;
      const typeAgg = new Map<string, number>();
      const companyAgg = new Map<string, number>();

      for (const d of all as any[]) {
        counts[d.status as keyof typeof counts] =
          (counts[d.status as keyof typeof counts] ?? 0) + 1;
        if (d.created_at >= since30) last30++;
        if (d.created_at >= since7) last7++;
        const tName = typeMap.get(d.document_type_id) ?? "Sem tipo";
        typeAgg.set(tName, (typeAgg.get(tName) ?? 0) + 1);
        const cName = companyMap.get(d.company_id) ?? "Sem empresa";
        companyAgg.set(cName, (companyAgg.get(cName) ?? 0) + 1);
      }

      const aiCostMonth = aiLogs.reduce(
        (s: number, l) => s + Number(l.cost_brl ?? 0),
        0,
      );

      return {
        total: all.length,
        pending: counts.pending,
        processing: counts.processing,
        processed: counts.processed,
        failed: counts.failed,
        last30,
        last7,
        aiCostMonth,
        aiCallsMonth: aiLogs.length,
        recent: (recentRes.data ?? []) as DocumentRow[],
        byType: Array.from(typeAgg.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
        byCompany: Array.from(companyAgg.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
        companiesCount: companies.length,
        typesCount: types.length,
      };
    },
  });

  const firstName = profile?.profile.full_name?.split(" ")[0] ?? "usuário";
  const fmt = (n: number) => n.toLocaleString("pt-BR");
  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const stats = [
    {
      label: "Total de documentos",
      value: data ? fmt(data.total) : "—",
      hint: data ? `${fmt(data.last30)} nos últimos 30 dias` : "Últimos 30 dias",
      icon: FileText,
      gradient: "from-indigo-500 to-blue-600",
      shadow: "shadow-indigo-500/20 hover:shadow-indigo-500/40",
    },
    {
      label: "Na fila",
      value: data ? fmt(data.pending + data.processing) : "—",
      hint: data
        ? `${fmt(data.pending)} aguardando · ${fmt(data.processing)} processando`
        : "Aguardando processamento",
      icon: Clock,
      gradient: "from-amber-500 to-orange-600",
      shadow: "shadow-amber-500/20 hover:shadow-amber-500/40",
    },
    {
      label: "Processados",
      value: data ? fmt(data.processed) : "—",
      hint: data
        ? `${fmt(data.failed)} com falha`
        : "Concluídos com sucesso",
      icon: CheckCircle2,
      gradient: "from-emerald-500 to-teal-600",
      shadow: "shadow-emerald-500/20 hover:shadow-emerald-500/40",
    },
    {
      label: "Custo IA (mês)",
      value: data ? fmtBRL(data.aiCostMonth) : "—",
      hint: data ? `${fmt(data.aiCallsMonth)} processamentos` : "Saldo do mês",
      icon: Sparkles,
      gradient: "from-slate-700 to-blue-900",
      shadow: "shadow-slate-700/20 hover:shadow-slate-700/40",
    },
  ];

  const shortcuts = [
    {
      to: "/upload",
      label: "Enviar documentos",
      desc: "Faça upload de novos arquivos",
      icon: Upload,
      gradient: "from-sky-500 to-blue-600",
    },
    {
      to: "/queue",
      label: "Ver fila",
      desc: "Acompanhe processamento",
      icon: ListChecks,
      gradient: "from-amber-500 to-orange-600",
    },
    {
      to: "/documents",
      label: "Pesquisar GED",
      desc: "Busque documentos indexados",
      icon: FolderOpen,
      gradient: "from-emerald-500 to-teal-600",
    },
    {
      to: "/credits",
      label: "Comprar créditos",
      desc: "Recarregue seu saldo IA",
      icon: Wallet,
      gradient: "from-fuchsia-500 to-purple-600",
    },
  ];

  const maxType = Math.max(1, ...(data?.byType.map((t) => t.count) ?? [0]));
  const maxCompany = Math.max(1, ...(data?.byCompany.map((t) => t.count) ?? [0]));

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5 mb-6">
        <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
              <Sparkles className="h-3.5 w-3.5 text-blue-800" />
              Painel geral
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
              Olá, {loading ? "..." : firstName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {profile?.currentOrg ? (
                <>Organização ativa: <span className="font-semibold text-foreground">{profile.currentOrg.name}</span></>
              ) : (
                "Configure sua organização para começar."
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Stats coloridos */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <Card
            key={s.label}
            className={`p-3 border-0 bg-gradient-to-br ${s.gradient} text-white shadow-lg ${s.shadow} hover:-translate-y-0.5 transition-all`}
          >
            <div className="relative flex items-center justify-center">
              <span className="text-[11px] font-medium text-white/85 uppercase tracking-wider">
                {s.label}
              </span>
              <s.icon className="absolute right-0 h-4 w-4 text-white/90" />
            </div>
            <div className="font-display text-2xl font-bold mt-1 tabular-nums leading-tight text-center">
              {isLoading ? "…" : s.value}
            </div>
            <p className="text-[11px] text-white/85 mt-0.5 text-center">{s.hint}</p>
          </Card>


        ))}
      </div>

      {/* Atalhos coloridos */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {shortcuts.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group relative overflow-hidden rounded-xl border border-border/60 bg-card p-4 hover:border-transparent hover:shadow-lg transition-all"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
            <div className="relative flex items-center gap-3">
              <div className={`h-10 w-10 rounded-lg bg-gradient-to-br ${s.gradient} grid place-items-center shadow-md shrink-0`}>
                <s.icon className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm group-hover:text-white transition-colors truncate">
                  {s.label}
                </div>
                <div className="text-xs text-muted-foreground group-hover:text-white/85 transition-colors truncate">
                  {s.desc}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      {/* Two-column: recentes + breakdowns */}
      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Documentos recentes</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Últimos enviados na organização
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/documents">
                Ver todos <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
            ) : !data?.recent.length ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum documento enviado ainda.
                <div className="mt-3">
                  <Button asChild size="sm">
                    <Link to="/upload">
                      <Upload className="h-4 w-4 mr-2" />
                      Enviar primeiro documento
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border/60">
                {data.recent.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/documents/$id"
                        params={{ id: d.id }}
                        className="text-sm font-medium truncate block hover:text-primary"
                      >
                        {d.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(d.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <StatusBadge status={d.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Atividade
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="Últimos 7 dias" value={fmt(data?.last7 ?? 0)} />
              <Row label="Últimos 30 dias" value={fmt(data?.last30 ?? 0)} />
              <Row label="Tipos cadastrados" value={fmt(data?.typesCount ?? 0)} />
              <Row label="Empresas" value={fmt(data?.companiesCount ?? 0)} />
              {data && data.failed > 0 && (
                <div className="flex items-center gap-2 pt-2 border-t border-border/60 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {fmt(data.failed)} documento(s) com falha
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid md:grid-cols-2 gap-4">
        <BreakdownCard
          title="Documentos por tipo"
          icon={FolderOpen}
          items={data?.byType ?? []}
          max={maxType}
          loading={isLoading}
        />
        <BreakdownCard
          title="Documentos por empresa"
          icon={Building2}
          items={data?.byCompany ?? []}
          max={maxCompany}
          loading={isLoading}
        />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function BreakdownCard({
  title,
  icon: Icon,
  items,
  max,
  loading,
}: {
  title: string;
  icon: typeof FolderOpen;
  items: { name: string; count: number }[];
  max: number;
  loading: boolean;
}) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !items.length ? (
          <p className="text-sm text-muted-foreground">Sem dados ainda.</p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="truncate pr-2">{item.name}</span>
                  <Badge variant="secondary" className="tabular-nums">
                    {item.count.toLocaleString("pt-BR")}
                  </Badge>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-amber-500 rounded-full transition-all"
                    style={{ width: `${(item.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
