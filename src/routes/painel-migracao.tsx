import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Eye, EyeOff, Copy, Check, ShieldAlert, Key, Download, Loader2, Code2, Database, AlertTriangle, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/painel-migracao")({
  component: PainelMigracao,
});

interface TableInfo {
  tablename: string;
  row_count: number;
  column_count: number;
  encrypted_columns: number;
  has_user_id: boolean;
}

interface Payload {
  project_url: string;
  anon_key: string;
  service_role_key: string;
  secrets: Record<string, string>;
  edge_functions: string[];
  edge_functions_count: number;
  database_tables: TableInfo[];
}

const SUPABASE_URL = "https://trgsifdxzwulsdtyyphs.supabase.co";

function mask(v: string) {
  if (!v) return "";
  if (v.length <= 20) return "•".repeat(v.length);
  return `${v.slice(0, 12)}•••••${v.slice(-8)}`;
}

function CopyBtn({ value, label }: { value: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setOk(true);
        toast.success(`${label ?? "Valor"} copiado`);
        setTimeout(() => setOk(false), 1200);
      }}
    >
      {ok ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {label ? <span className="ml-2">{label}</span> : null}
    </Button>
  );
}

function SecretRow({ label, value }: { label: string; value: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border p-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <code className="block truncate font-mono text-sm">{show ? value : mask(value)}</code>
      </div>
      <Button variant="ghost" size="icon" onClick={() => setShow((s) => !s)}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
      <CopyBtn value={value} />
    </div>
  );
}

function classifyTable(t: TableInfo): "Essencial" | "Histórico" | "Ignorar" {
  const n = t.tablename.toLowerCase();
  if (n.includes("log") || n.includes("audit") || n.includes("history")) return "Histórico";
  if (t.row_count === 0) return "Ignorar";
  return "Essencial";
}

function PainelMigracao() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Payload | null>(null);

  const reveal = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/painel-migracao`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as Payload;
      setData(j);
      toast.success("Dados carregados");
    } catch (e) {
      toast.error(`Falha: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const copyAll = () => {
    if (!data) return;
    const secretsText = Object.entries(data.secrets)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    const text = [
      "═══ PROJECT URL ═══",
      data.project_url,
      "",
      "═══ ANON KEY ═══",
      data.anon_key,
      "",
      "═══ SERVICE ROLE KEY ═══",
      data.service_role_key,
      "",
      "═══ EDGE FUNCTIONS ═══",
      data.edge_functions.join("\n"),
      "",
      "═══ SECRETS ═══",
      secretsText,
    ].join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Tudo copiado");
  };

  const downloadEdgeFunctions = () => {
    const modules = import.meta.glob("/supabase/functions/*/index.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>;
    const parts: string[] = [];
    let count = 0;
    for (const [path, code] of Object.entries(modules)) {
      const name = path.split("/").slice(-2, -1)[0];
      parts.push(`// ═══ ${name} ═══\n${code}\n`);
      count++;
    }
    const blob = new Blob([parts.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "edge-functions.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${count} função(ões) exportada(s)`);
  };

  const downloadSecrets = () => {
    if (!data) return;
    const entries = Object.entries(data.secrets)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
    const content = `export const SECRETS = {\n${entries}\n} as const;\n\nexport type SecretKey = keyof typeof SECRETS;\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "secrets.ts";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("secrets.ts baixado");
  };

  const extraSecrets = data
    ? Object.entries(data.secrets).filter(
        ([k]) =>
          ![
            "SUPABASE_URL",
            "SUPABASE_ANON_KEY",
            "SUPABASE_PUBLISHABLE_KEY",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_DB_URL",
          ].includes(k),
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Painel de Migração</h1>
        <p className="text-muted-foreground">
          Copie os itens abaixo na ordem e cole na extensão CloneSupa.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={reveal} disabled={loading} size="lg">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Revelar Tudo
          </Button>
          {data && (
            <Button variant="outline" onClick={copyAll} size="lg">
              <Copy className="mr-2 h-4 w-4" /> Copiar Tudo
            </Button>
          )}
        </div>
      </header>

      {/* Passo 1 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" /> Passo 1 — Credenciais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              <SecretRow label="Project URL" value={data.project_url} />
              <SecretRow label="Anon Key" value={data.anon_key} />
              <SecretRow label="Service Role Key" value={data.service_role_key} />
              <div className="flex flex-wrap gap-2 pt-2">
                <CopyBtn value={data.project_url} label="Copiar Project URL" />
                <CopyBtn value={data.service_role_key} label="Copiar Service Role Key" />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Clique em "Revelar Tudo" para carregar.</p>
          )}
        </CardContent>
      </Card>

      {/* Passo 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" /> Passo 2 — Edge Functions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              <div className="flex flex-wrap gap-2">
                {data.edge_functions.map((n) => (
                  <Badge key={n} variant="secondary">{n}</Badge>
                ))}
                {data.edge_functions.length === 0 && (
                  <span className="text-sm text-muted-foreground">Nenhuma função detectada.</span>
                )}
              </div>
              <Button onClick={downloadEdgeFunctions} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Baixar edge-functions.ts
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>

      {/* Passo 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Passo 3 — Secrets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              <div className="space-y-2">
                {extraSecrets.map(([k, v]) => (
                  <SecretRow key={k} label={k} value={v} />
                ))}
                {extraSecrets.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sem secrets extras.</p>
                )}
              </div>
              <Button onClick={downloadSecrets} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Baixar secrets.ts
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </CardContent>
      </Card>

      {/* Passo 4 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Passo 4 — Conferência
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data ? (
            <>
              <div className="text-sm text-muted-foreground">
                Total: <strong>{data.database_tables?.length ?? 0}</strong> tabelas
              </div>
              <div className="max-h-80 overflow-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left">Tabela</th>
                      <th className="p-2 text-right">Linhas</th>
                      <th className="p-2 text-right">Colunas</th>
                      <th className="p-2 text-left">Classificação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.database_tables ?? []).map((t) => (
                      <tr key={t.tablename} className="border-t">
                        <td className="p-2 font-mono">{t.tablename}</td>
                        <td className="p-2 text-right">{t.row_count}</td>
                        <td className="p-2 text-right">{t.column_count}</td>
                        <td className="p-2">
                          <Badge variant="outline">{classifyTable(t)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
                <div>
                  <strong>Aviso sobre senhas:</strong> as senhas são copiadas como hash bcrypt. Se o
                  JWT secret do destino mudar, sessões antigas caem, mas a senha continua válida —
                  usuários apenas precisarão fazer login novamente.
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" /> Revele tudo para ver as tabelas.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
