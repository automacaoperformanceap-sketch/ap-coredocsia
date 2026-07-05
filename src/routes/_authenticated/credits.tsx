import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Wallet,
  TrendingDown,
  TrendingUp,
  BellRing,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
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
import { supabase } from "@/integrations/supabase/client";
import { useProfileBundle } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/credits")({
  component: CreditsPage,
});

interface CreditBalance {
  org_id: string;
  balance_brl: number;
  total_recharged_brl: number;
  total_consumed_brl: number;
  low_balance_threshold_brl: number;
  low_balance_alert_enabled: boolean;
}

interface CreditTransaction {
  id: string;
  created_at: string;
  type: "recharge" | "consumption" | "adjustment" | "refund";
  amount_brl: number;
  balance_after_brl: number | null;
  description: string | null;
}

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
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

const TYPE_LABEL: Record<CreditTransaction["type"], string> = {
  recharge: "Recarga",
  consumption: "Consumo",
  adjustment: "Ajuste",
  refund: "Estorno",
};

function CreditsPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data: balance } = useQuery({
    queryKey: ["credit-balance", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CreditBalance | null> => {
      const { data, error } = await supabase
        .from("credit_balances")
        .select(
          "org_id, balance_brl, total_recharged_brl, total_consumed_brl, low_balance_threshold_brl, low_balance_alert_enabled",
        )
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return (data as CreditBalance | null) ?? null;
    },
  });

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-transactions", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<CreditTransaction[]> => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id, created_at, type, amount_brl, balance_after_brl, description")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CreditTransaction[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (t) =>
        (t.description ?? "").toLowerCase().includes(q) ||
        TYPE_LABEL[t.type].toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const currentBalance = Number(balance?.balance_brl ?? 0);
  const totalRecharged = Number(balance?.total_recharged_brl ?? 0);
  const totalConsumed = Number(balance?.total_consumed_brl ?? 0);
  const threshold = Number(balance?.low_balance_threshold_brl ?? 0);
  const lowBalance =
    (balance?.low_balance_alert_enabled ?? true) && currentBalance <= threshold;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
              <Wallet className="h-3.5 w-3.5 text-blue-800" />
              Painel de créditos
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
              Créditos
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
              Saldo, consumo de IA, recargas e alertas de saldo baixo da organização.
              Acompanhe todas as movimentações financeiras em um só lugar.
            </p>
          </div>
          <Button
            size="sm"
            className="gap-2 justify-center"
            onClick={() =>
              toast.info("Recarga via Stripe", {
                description:
                  "Habilite o pagamento via Stripe para liberar recargas automáticas.",
              })
            }
          >
            <CreditCard className="h-4 w-4" />
            Comprar créditos
          </Button>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-2.5 border-0 bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <Wallet className="absolute right-0 h-3.5 w-3.5" />
            <span>Saldo atual</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {formatBRL(currentBalance)}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            disponível para uso
          </div>
        </Card>

        <Card className="p-2.5 border-0 bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/20 hover:shadow-rose-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <TrendingDown className="absolute right-0 h-3.5 w-3.5" />
            <span>Créditos consumidos</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {formatBRL(totalConsumed)}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            acumulado total
          </div>
        </Card>

        <Card className="p-2.5 border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5 transition-all">
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <TrendingUp className="absolute right-0 h-3.5 w-3.5" />
            <span>Total recarregado</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {formatBRL(totalRecharged)}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            histórico de recargas
          </div>
        </Card>

        <Card
          className={`p-2.5 border-0 text-white shadow-lg hover:-translate-y-0.5 transition-all ${
            lowBalance
              ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/20 hover:shadow-amber-500/40"
              : "bg-gradient-to-br from-slate-700 to-blue-900 shadow-slate-700/20 hover:shadow-slate-700/40"
          }`}
        >
          <div className="relative flex items-center justify-center text-white/85 text-[11px] font-medium">
            <BellRing className="absolute right-0 h-3.5 w-3.5" />
            <span>Alerta saldo baixo</span>
          </div>
          <div className="text-center text-2xl font-bold mt-1 tabular-nums leading-tight">
            {formatBRL(threshold)}
          </div>
          <div className="text-center text-[11px] text-white/85 mt-0.5">
            {lowBalance ? "⚠ saldo abaixo do limite" : "limite configurado"}
          </div>
        </Card>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-semibold">Histórico de transações</h3>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por descrição ou tipo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="max-w-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() =>
                toast.info("Configurações em breve", {
                  description: "A configuração de alerta de saldo baixo será liberada em breve.",
                })
              }
            >
              <Settings2 className="h-4 w-4" /> Configurar alerta
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhuma transação registrada ainda.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              As recargas e consumos aparecerão aqui automaticamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo após</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((t) => {
                  const isIn = t.type === "recharge" || t.type === "refund";
                  const amount = Number(t.amount_brl);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDateTime(t.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isIn ? "secondary" : "outline"}
                          className="gap-1"
                        >
                          {isIn ? (
                            <ArrowDownCircle className="h-3 w-3" />
                          ) : (
                            <ArrowUpCircle className="h-3 w-3" />
                          )}
                          {TYPE_LABEL[t.type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[320px] truncate">
                        {t.description ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${
                          isIn ? "text-emerald-600" : "text-rose-600"
                        }`}
                      >
                        {isIn ? "+" : "−"} {formatBRL(Math.abs(amount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {t.balance_after_brl != null
                          ? formatBRL(Number(t.balance_after_brl))
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Mostrando {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length}
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
    </div>
  );
}
