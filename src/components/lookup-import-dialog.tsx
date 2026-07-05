import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Loader2, Upload, Trash2, Database } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { normalizeLookupKey } from "@/lib/lookup";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentTypeId: string;
  orgId: string;
  companyId: string | null;
}

type Row = Record<string, string>;

export function LookupImportDialog({
  open,
  onOpenChange,
  documentTypeId,
  orgId,
  companyId,
}: Props) {
  const qc = useQueryClient();
  const { data: fields = [] } = useDocumentTypeFields(documentTypeId);
  const keyField = fields.find((f) => f.is_lookup_key);

  const [step, setStep] = useState<1 | 2>(1);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // field_key -> column header
  const [mode, setMode] = useState<"upsert" | "replace">("upsert");
  const [busy, setBusy] = useState(false);

  const count = useQuery({
    queryKey: ["doc-type-lookup-count", documentTypeId],
    enabled: open && !!documentTypeId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("document_type_lookups")
        .select("id", { count: "exact", head: true })
        .eq("document_type_id", documentTypeId);
      if (error) throw error;
      return count ?? 0;
    },
  });

  function resetWizard() {
    setStep(1);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setMode("upsert");
  }

  function close() {
    resetWizard();
    onOpenChange(false);
  }

  async function onFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo maior que 5 MB");
      return;
    }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
      if (json.length === 0) {
        toast.error("Planilha vazia");
        return;
      }
      if (json.length > 50000) {
        toast.error("Máximo de 50.000 linhas por importação");
        return;
      }
      const cols = Object.keys(json[0]);
      setHeaders(cols);
      setRows(json);
      // Auto-mapping por nome igual
      const auto: Record<string, string> = {};
      for (const f of fields) {
        const match = cols.find(
          (c) =>
            c.trim().toLowerCase() === f.label.trim().toLowerCase() ||
            c.trim().toLowerCase() === f.field_key.trim().toLowerCase(),
        );
        if (match) auto[f.field_key] = match;
      }
      setMapping(auto);
      setStep(2);
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao ler arquivo");
    }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!keyField) throw new Error("Marque um campo como 'Campo-chave (lookup)' primeiro");
      const keyCol = mapping[keyField.field_key];
      if (!keyCol) throw new Error("Mapeie o campo-chave");

      if (mode === "replace") {
        const { error } = await supabase
          .from("document_type_lookups")
          .delete()
          .eq("document_type_id", documentTypeId);
        if (error) throw error;
      }

      const byKey = new Map<string, any>();
      let skippedDup = 0;
      let skippedEmpty = 0;
      for (const r of rows) {
        const key = normalizeLookupKey(r[keyCol] ?? "");
        if (!key) {
          skippedEmpty++;
          continue;
        }
        const values: Record<string, string> = {};
        for (const f of fields) {
          if (f.is_lookup_key) continue;
          const col = mapping[f.field_key];
          if (!col) continue;
          const v = (r[col] ?? "").toString();
          if (v.trim() !== "") values[f.field_key] = v.trim();
        }
        if (byKey.has(key)) skippedDup++;
        byKey.set(key, {
          org_id: orgId,
          company_id: companyId,
          document_type_id: documentTypeId,
          key_value: key,
          values,
        });
      }
      const payload = Array.from(byKey.values());

      if (payload.length === 0) throw new Error("Nenhuma linha válida (chave vazia)");

      // Lotes de 500
      let inserted = 0;
      for (let i = 0; i < payload.length; i += 500) {
        const slice = payload.slice(i, i + 500);
        const { error } = await supabase
          .from("document_type_lookups")
          .upsert(slice, { onConflict: "document_type_id,key_value" });
        if (error) throw error;
        inserted += slice.length;
      }
      return { inserted, totalRows: rows.length, skippedDup, skippedEmpty };
    },
    onSuccess: (res) => {
      const parts = [
        `${res.inserted} chave(s) única(s) salva(s) de ${res.totalRows} linha(s) do arquivo`,
      ];
      if (res.skippedDup > 0)
        parts.push(`${res.skippedDup} linha(s) com chave repetida no arquivo (mantida a última)`);
      if (res.skippedEmpty > 0)
        parts.push(`${res.skippedEmpty} linha(s) sem chave ignorada(s)`);
      toast.success(parts.join(" · "));
      qc.invalidateQueries({ queryKey: ["doc-type-lookup-count", documentTypeId] });
      close();
    },

    onError: (e: any) => toast.error(e.message ?? "Falha na importação"),
    onSettled: () => setBusy(false),
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("document_type_lookups")
        .delete()
        .eq("document_type_id", documentTypeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Base limpa");
      qc.invalidateQueries({ queryKey: ["doc-type-lookup-count", documentTypeId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" /> Base de lookup
          </DialogTitle>
          <DialogDescription>
            Importe CSV/XLSX para preenchimento automático ao indexar documentos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div>
            <span className="text-muted-foreground">Registros atuais: </span>
            <span className="font-semibold">{count.data ?? "—"}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (confirm("Apagar todos os registros da base?")) clearMut.mutate();
            }}
            disabled={clearMut.isPending || (count.data ?? 0) === 0}
          >
            <Trash2 className="h-4 w-4 mr-1 text-destructive" /> Limpar base
          </Button>
        </div>

        {!keyField && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 px-3 py-2 text-sm">
            Marque um dos campos como <strong>Campo-chave (lookup)</strong> antes de importar.
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3 py-2">
            <Label>Arquivo CSV ou XLSX</Label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              disabled={!keyField}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
            <p className="text-xs text-muted-foreground">
              Até 5 MB · 50.000 linhas · 1ª linha deve conter cabeçalhos.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 py-2 max-h-[60vh] overflow-auto">
            <div>
              <h4 className="text-sm font-medium mb-2">Mapeamento de colunas</h4>
              <div className="space-y-2">
                {fields.map((f) => (
                  <div key={f.id} className="grid grid-cols-2 gap-2 items-center">
                    <Label className="text-sm">
                      {f.label}
                      {f.is_lookup_key && (
                        <span className="ml-2 text-xs text-primary">(chave)</span>
                      )}
                    </Label>
                    <Select
                      value={mapping[f.field_key] ?? "__none__"}
                      onValueChange={(v) =>
                        setMapping((m) => ({
                          ...m,
                          [f.field_key]: v === "__none__" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="— não mapear —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— não mapear —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Modo de importação</h4>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="upsert">Adicionar/atualizar por chave</SelectItem>
                  <SelectItem value="replace">Substituir base inteira</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">
                Pré-visualização ({rows.length} linhas)
              </h4>
              <div className="rounded border overflow-auto max-h-56">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r, i) => (
                      <TableRow key={i}>
                        {headers.map((h) => (
                          <TableCell key={h} className="text-xs">
                            {r[h]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 2 && (
            <Button type="button" variant="ghost" onClick={() => setStep(1)}>
              Voltar
            </Button>
          )}
          <Button type="button" variant="outline" onClick={close}>
            Cancelar
          </Button>
          {step === 2 && (
            <Button
              type="button"
              onClick={() => {
                setBusy(true);
                importMut.mutate();
              }}
              disabled={busy || importMut.isPending}
            >
              {importMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Importar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
