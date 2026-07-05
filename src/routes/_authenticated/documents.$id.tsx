import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentViewer } from "@/components/document-viewer";
import { useDocument } from "@/hooks/use-documents";
import { useDocumentTypeFields } from "@/hooks/use-document-type-fields";
import { supabase } from "@/integrations/supabase/client";
import { upsertDocTypeRow } from "@/lib/doc-type-storage.functions";

import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/documents/$id")({
  component: DocumentDetailPage,
});

function charDiff(a: string, b: string): number {
  const original = Array.from(a);
  const corrected = Array.from(b);
  const originalLength = original.length;
  const correctedLength = corrected.length;

  if (originalLength === 0) return correctedLength;
  if (correctedLength === 0) return originalLength;

  const lcs: number[][] = Array.from({ length: originalLength + 1 }, () =>
    Array(correctedLength + 1).fill(0),
  );

  for (let i = originalLength - 1; i >= 0; i--) {
    for (let j = correctedLength - 1; j >= 0; j--) {
      lcs[i][j] =
        original[i] === corrected[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  let diff = 0;
  let removed = 0;
  let inserted = 0;
  const flushEditBlock = () => {
    diff += Math.max(removed, inserted);
    removed = 0;
    inserted = 0;
  };

  while (i < originalLength && j < correctedLength) {
    if (original[i] === corrected[j]) {
      flushEditBlock();
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      removed++;
      i++;
    } else {
      inserted++;
      j++;
    }
  }

  removed += originalLength - i;
  inserted += correctedLength - j;
  flushEditBlock();

  return diff;
}

function DocumentDetailPage() {
  const { id } = Route.useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: doc, isLoading } = useDocument(id);
  const { data: fields = [] } = useDocumentTypeFields(doc?.document_type_id ?? null);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (doc) setValues((doc.field_values ?? {}) as Record<string, unknown>);
  }, [doc]);

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Carregando...</div>;
  }
  if (!doc) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-muted-foreground">Documento não encontrado.</p>
        <Button asChild variant="outline">
          <Link to="/documents">Voltar</Link>
        </Button>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData.user?.id;

    // Normaliza ao salvar (uppercase + trim) sem interferir na digitação.
    const normalized: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.field_key];
      const str = raw == null ? "" : String(raw).trim();
      if (f.field_key.toLowerCase().includes("matricula")) {
        normalized[f.field_key] = str.replace(/\D/g, "");
      } else if (f.field_type === "number" || f.field_type === "date") {
        normalized[f.field_key] = str;
      } else {
        normalized[f.field_key] = str.toUpperCase();
      }
    }

    // Soma os blocos de edição manuais sem multiplicar caracteres deslocados por inserções/remoções.
    const original = (doc!.field_values ?? {}) as Record<string, unknown>;
    let correctedChars = 0;
    const keys = new Set([...Object.keys(original), ...Object.keys(normalized)]);
    for (const k of keys) {
      const a = original[k] == null ? "" : String(original[k]);
      const b = normalized[k] == null ? "" : String(normalized[k]);
      if (a !== b) correctedChars += charDiff(a, b);
    }


    const { error } = await supabase
      .from("documents")
      .update({
        field_values: normalized as never,
        last_edited_by: userId ?? doc!.uploaded_by,
      })
      .eq("id", doc!.id);
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    // Replica em tabela física do tipo (no-op para tipos antigos)
    if (doc!.document_type_id) {
      try {
        await upsertDocTypeRow({
          data: {
            typeId: doc!.document_type_id,
            documentId: doc!.id,
            values: normalized,
          },
        });
      } catch (e) {
        console.error("upsertDocTypeRow falhou", e);
      }
    }



    if (correctedChars > 0) {
      const { data: logRow } = await supabase
        .from("ai_usage_logs")
        .select("id, corrected_chars")
        .eq("document_id", doc!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (logRow) {
        await supabase
          .from("ai_usage_logs")
          .update({ corrected_chars: (logRow.corrected_chars ?? 0) + correctedChars })
          .eq("id", logRow.id);
      }
    }

    setSaving(false);
    toast.success("Indexação atualizada");
    queryClient.invalidateQueries({ queryKey: ["document", doc!.id] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["ai-usage-logs"] });
    router.history.back();
  }

  const sanitize = (f: (typeof fields)[number], raw: string) => {
    if (f.field_key.toLowerCase().includes("matricula")) {
      return raw.replace(/\D/g, "");
    }
    return raw;
  };

  const set = (f: (typeof fields)[number], raw: string) =>
    setValues((prev) => ({ ...prev, [f.field_key]: sanitize(f, raw) }));

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto">
        <div className="p-6 max-w-3xl space-y-6">
          <Button asChild variant="ghost" size="sm">
            <Link to="/documents">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
            </Link>
          </Button>

          <header>
            <h1 className="text-2xl font-display font-bold tracking-tight break-words">
              {doc.name}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Corrija os campos de indexação abaixo.
            </p>
          </header>

          <Card className="p-5 space-y-4">
            {fields.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Este documento não possui campos de indexação configurados.
              </p>
            )}
            {fields.map((f) => {
              const v = values[f.field_key];
              const strVal = v === null || v === undefined ? "" : String(v);
              const isMatricula = f.field_key.toLowerCase().includes("matricula");
              return (
                <div key={f.id} className="space-y-1.5">
                  <Label htmlFor={`f-${f.id}`}>
                    {f.label}
                    {f.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  {f.field_type === "select" && Array.isArray(f.options) ? (
                    <Select
                      value={strVal || "none"}
                      onValueChange={(val) => set(f, val === "none" ? "" : val)}
                    >
                      <SelectTrigger id={`f-${f.id}`}>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {(f.options as string[]).map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`f-${f.id}`}
                      value={strVal}
                      onChange={(e) => set(f, e.target.value)}
                      className={isMatricula ? undefined : f.field_type !== "number" && f.field_type !== "date" ? "uppercase" : undefined}
                      type={
                        f.field_type === "number"
                          ? "number"
                          : f.field_type === "date"
                          ? "date"
                          : "text"
                      }
                    />
                  )}
                </div>
              );
            })}
            {fields.length > 0 && (
              <Button onClick={save} disabled={saving}>
                <Save className="h-4 w-4 mr-1.5" /> Salvar alterações
              </Button>
            )}
          </Card>
        </div>
      </div>

      <aside className="w-[520px] border-l border-border hidden lg:flex flex-col">
        <DocumentViewer doc={doc} />
      </aside>
    </div>
  );
}
