import { useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { PdfPreview } from "@/components/pdf-preview";
import { useDropzone } from "react-dropzone";
import { createFileRoute } from "@tanstack/react-router";
import {
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Loader2,
  FolderOpen,
  Eraser,
  ArrowDown,
  ArrowUp,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { extractFieldsWithGemini } from "@/lib/gemini.functions";
import { compressImageIfNeeded } from "@/lib/image-compress";
import { extractFieldsWithClaude } from "@/lib/claude.functions";
import { lookupByKey } from "@/lib/lookup";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { useProfileBundle } from "@/hooks/use-profile";
import { useDocumentTypes } from "@/hooks/use-document-types";
import { useCompanies } from "@/hooks/use-companies";
import { useDocumentTypeFields, type DocTypeField } from "@/hooks/use-document-type-fields";
import { useAllowedDocumentTypeIds } from "@/hooks/use-allowed-document-types";
import {
  ALLOWED_MIME,
  MAX_FILES_PER_BATCH,
  formatBytes,
  uploadDocument,
  validateFile,
} from "@/lib/documents";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

interface QueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  fieldValues: Record<string, string>;
  sourcePath?: string | null;
  aiUsage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model: string; log_id?: string | null } | null;
  aiOriginalValues?: Record<string, string>;
  aiStatus?: "success" | "failed" | "incomplete";
  aiProvider?: "gemini" | "claude";
  aiMessage?: string;
  expanded: boolean;
}

function normalizeManualSourcePath(path: string): string | null {
  const normalized = path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\/+/, "")
    .replace(/\/+$/, "")
    .trim();

  if (!normalized || normalized === ".") return null;
  return normalized;
}

function getFileSourcePath(file: File): string | null {
  const rawPath =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    (file as File & { path?: string }).path ||
    "";
  const normalizedFilePath = rawPath
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\/+/, "")
    .trim();

  if (!normalizedFilePath.includes("/")) return null;
  return normalizeManualSourcePath(normalizedFilePath.slice(0, normalizedFilePath.lastIndexOf("/")));
}



interface FieldEditorProps {
  fields: DocTypeField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onFieldBlur?: (key: string, value: string) => void;
  idPrefix: string;
  originals?: Record<string, string>;
  aiRan?: boolean;
}




function sanitizeFieldValue(field: DocTypeField, raw: string): string {
  const isMatricula = field.field_key.toLowerCase().includes("matricula");

  if (isMatricula) {
    return raw.replace(/\D/g, "");
  }
  if (field.field_type === "number" || field.field_type === "date") {
    return raw;
  }
  return raw.toUpperCase();
}

function handleCaretPreservingChange(
  e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  field: DocTypeField,
  commit: (value: string) => void,
) {
  const el = e.target;
  const original = el.value;
  const start = el.selectionStart ?? original.length;
  const newVal = sanitizeFieldValue(field, original);
  const delta = newVal.length - original.length;
  const nextPos = Math.max(0, Math.min(newVal.length, start + delta));
  commit(newVal);
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(nextPos, nextPos);
    } catch {
      /* element may have unmounted */
    }
  });
}

function FieldEditor({ fields, values, onChange, onFieldBlur, idPrefix, originals, aiRan }: FieldEditorProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {fields.map((f, idx) => {
        const val = values[f.field_key] ?? "";
        const id = `${idPrefix}-${f.id}`;
        const isMatricula = f.field_key.toLowerCase().includes("matricula");
        const handleBlur = () => onFieldBlur?.(f.field_key, val);
        const next = fields[idx + 1];
        const prev = fields[idx - 1];
        const originalRaw = originals?.[f.field_key];
        const originalSanitized =
          originalRaw != null ? sanitizeFieldValue(f, originalRaw) : undefined;
        const clearField = () => {
          onChange(f.field_key, "");
          onFieldBlur?.(f.field_key, "");
        };
        const restoreOriginal = () => {
          if (originalSanitized == null) return;
          onChange(f.field_key, originalSanitized);
          onFieldBlur?.(f.field_key, originalSanitized);
        };
        const moveDown = () => {
          if (!next) return;
          const transferred = sanitizeFieldValue(next, val);
          onChange(next.field_key, transferred);
          onFieldBlur?.(next.field_key, transferred);
          onChange(f.field_key, "");
          onFieldBlur?.(f.field_key, "");
        };
        const moveUp = () => {
          if (!prev) return;
          const transferred = sanitizeFieldValue(prev, val);
          onChange(prev.field_key, transferred);
          onFieldBlur?.(prev.field_key, transferred);
          onChange(f.field_key, "");
          onFieldBlur?.(f.field_key, "");
        };

        return (
          <div key={f.id} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={id} className="text-xs flex items-center gap-1">
                {f.label} {f.required && <span className="text-destructive">*</span>}
                {f.is_lookup_key && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-primary">
                    chave
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={clearField}
                  disabled={!val}
                  title="Limpar campo"
                >
                  <Eraser className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={moveUp}
                  disabled={!val || !prev}
                  title={prev ? `Mover para "${prev.label}"` : "Sem campo acima"}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={restoreOriginal}
                  disabled={originalSanitized == null || val === originalSanitized}
                  title={
                    originalSanitized == null
                      ? "Sem valor original da extração"
                      : `Restaurar valor original: "${originalSanitized}"`
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"

                  onClick={moveDown}
                  disabled={!val || !next}
                  title={next ? `Mover para "${next.label}"` : "Sem campo abaixo"}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {(() => {
              const expLen = f.expected_length ?? 0;
              const lengthMismatch = expLen > 0 && val.length > 0 && val.length !== expLen;
              const emptyAfterAi = expLen > 0 && val.length === 0 && !!aiRan;
              const mismatchClass = (lengthMismatch || emptyAfterAi)
                ? "bg-pink-100 border-pink-400 focus-visible:ring-pink-400 dark:bg-pink-950/40"
                : "";

              return f.field_type === "textarea" ? (
              <Textarea
                id={id}
                value={val}
                onChange={(e) => handleCaretPreservingChange(e, f, (v) => onChange(f.field_key, v))}
                onBlur={handleBlur}
                rows={2}
                className={cn("min-h-[48px] py-1 text-sm", isMatricula ? undefined : "uppercase", mismatchClass)}
                title={lengthMismatch ? `Esperado ${expLen} caracteres, atual ${val.length}` : undefined}
              />
            ) : f.field_type === "select" && Array.isArray(f.options) ? (
              <Select value={val} onValueChange={(v) => { onChange(f.field_key, sanitizeFieldValue(f, v)); onFieldBlur?.(f.field_key, v); }}>
                <SelectTrigger className={cn("h-8 px-2 text-sm", isMatricula ? undefined : "uppercase", mismatchClass)}>
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {(f.options as string[]).map((o) => (
                    <SelectItem key={o} value={o} className={isMatricula ? undefined : "uppercase"}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                value={val}
                onChange={(e) => handleCaretPreservingChange(e, f, (v) => onChange(f.field_key, v))}
                onBlur={handleBlur}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                placeholder={f.field_type === "date" ? "DD/MM/AAAA" : undefined}
                inputMode={f.field_type === "date" ? "numeric" : undefined}
                className={cn(
                  "h-8 px-2 text-sm",
                  isMatricula ? undefined : f.field_type !== "number" && f.field_type !== "date" ? "uppercase" : undefined,
                  mismatchClass,
                )}
                title={lengthMismatch ? `Esperado ${expLen} caracteres, atual ${val.length}` : undefined}
                type={f.field_type === "number" ? "number" : "text"}
              />
              );
            })()}

          </div>
        );
      })}

    </div>
  );
}


function PdfFilePreview({ file }: { file: File }) {
  const [data, setData] = useState<ArrayBuffer | null>(null);
  useEffect(() => {
    let cancelled = false;
    file.arrayBuffer().then((b) => {
      if (!cancelled) setData(b);
    });
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (!data) return <div className="text-xs text-muted-foreground">Carregando PDF…</div>;
  return <PdfPreview data={data} title={file.name} />;
}

interface ZoomablePreviewProps {
  children: ReactNode;
  initialScale?: number;
}

function ZoomablePreview({ children, initialScale = 1 }: ZoomablePreviewProps) {
  const [scale, setScale] = useState(initialScale);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 4)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.5)), []);
  const resetZoom = useCallback(() => setScale(initialScale), [initialScale]);

  return (
    <div className="relative w-full h-full overflow-auto" ref={containerRef}>
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1 bg-card/90 backdrop-blur rounded-md border border-border shadow-sm p-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className="h-7 w-7"
          title="Diminuir zoom"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={resetZoom}
          className="h-7 w-7"
          title="Redefinir zoom"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={zoomIn}
          disabled={scale >= 4}
          className="h-7 w-7"
          title="Aumentar zoom"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
      </div>
      <div
        className="origin-top-left transition-transform"
        style={{
          transform: `scale(${scale})`,
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function UploadPage() {
  const { data: profile } = useProfileBundle();
  const orgId = profile?.currentOrg?.id ?? null;
  const userId = profile?.profile.id ?? null;
  const { data: companies = [] } = useCompanies(orgId);
  const { data: allTypes = [] } = useDocumentTypes(orgId);
  const { data: allowedTypeIds = null } = useAllowedDocumentTypeIds();
  const queryClient = useQueryClient();

  const topAnchorRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [companyId, setCompanyId] = useState<string>("none");
  const [docTypeId, setDocTypeId] = useState<string>("none");
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState<null | "gemini" | "claude">(null);
  const [batchProgress, setBatchProgress] = useState<{
    action: "extract" | "upload";
    current: number;
    total: number;
    fileName: string;
    itemId: string;
    sourcePath: string | null;
  } | null>(null);
  const [extractStartedAt, setExtractStartedAt] = useState<Date | null>(null);
  const [uploadStartedAt, setUploadStartedAt] = useState<Date | null>(null);
  const extractGeminiFn = useServerFn(extractFieldsWithGemini);
  const extractClaudeFn = useServerFn(extractFieldsWithClaude);
  const cancelExtractRef = useRef(false);

  const refreshAuthSessionIfNeeded = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const exp = sessionData.session?.expires_at ?? 0;
    const nowSec = Math.floor(Date.now() / 1000);
    if (!sessionData.session || exp - nowSec < 300) {
      await supabase.auth.refreshSession();
    }
  }, []);

  const runExtractWithFreshAuth = useCallback(
    async (
      extractFn: (options: { data: FormData }) => Promise<unknown>,
      form: FormData,
    ) => {
      await refreshAuthSessionIfNeeded();
      try {
        return await extractFn({ data: form });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error ?? "");
        if (!/Unauthorized:\s*Invalid token/i.test(message)) throw error;
        await supabase.auth.refreshSession();
        return extractFn({ data: form });
      }
    },
    [refreshAuthSessionIfNeeded],
  );

  const types = useMemo(() => {
    let list = allTypes;
    if (companyId !== "none") list = list.filter((t: any) => t.company_id === companyId);
    if (allowedTypeIds) list = list.filter((t) => allowedTypeIds.includes(t.id));
    return list;
  }, [allTypes, companyId, allowedTypeIds]);

  const { data: fields = [] } = useDocumentTypeFields(
    docTypeId !== "none" ? docTypeId : null,
  );

  const [manualSourcePath, setManualSourcePath] = useState<string>("");
  const manualSourcePathRef = useRef<string>("");
  useEffect(() => {
    manualSourcePathRef.current = manualSourcePath;
  }, [manualSourcePath]);

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    rejected.forEach((r) => {
      toast.error(`${r.file.name}: ${r.errors[0]?.message ?? "rejeitado"}`);
    });
    setItems((prev) => {
      const room = MAX_FILES_PER_BATCH - prev.length;
      if (room <= 0) {
        toast.error(`Máximo de ${MAX_FILES_PER_BATCH} arquivos por lote`);
        return prev;
      }
      const manual = normalizeManualSourcePath(manualSourcePathRef.current);
      const toAdd = accepted.slice(0, room).map<QueueItem>((file) => {
        const fromBrowser = getFileSourcePath(file);
        const sourcePath = fromBrowser ?? (manual ? manual : null);
        return {
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: "queued",
          progress: 0,
          fieldValues: {},
          sourcePath,
          expanded: true,
        };
      });

      return [...prev, ...toAdd];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_MIME.reduce<Record<string, string[]>>((acc, m) => {
      acc[m] = [];
      return acc;
    }, {}),
    maxSize: 50 * 1024 * 1024,
    multiple: true,
    disabled: isUploading,
  });

  function removeItem(id: string) {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function setItemFieldValue(id: string, key: string, value: string) {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const nextValues = { ...i.fieldValues, [key]: value };
        let aiStatus = i.aiStatus;
        let aiMessage = i.aiMessage;
        // Se o usuário preencher manualmente tudo que falta, libera o envio.
        if (aiStatus === "incomplete" || aiStatus === "failed") {
          const missing = fields.some(
            (f) => f.required && !String(nextValues[f.field_key] ?? "").trim(),
          );
          if (!missing) {
            aiStatus = "success";
            aiMessage = undefined;
          }
        }
        return { ...i, fieldValues: nextValues, aiStatus, aiMessage };
      }),
    );
  }


  async function handleKeyFieldBlur(itemId: string, fieldKey: string, value: string) {
    if (docTypeId === "none") return;
    const f = fields.find((x) => x.field_key === fieldKey);
    if (!f?.is_lookup_key) return;
    const v = (value ?? "").trim();
    if (!v) return;
    try {
      const result = await lookupByKey(docTypeId, v);
      if (!result) {
        toast.info("Nenhum registro encontrado na base de lookup");
        return;
      }
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== itemId) return i;
          const merged = { ...i.fieldValues };
          for (const [k, val] of Object.entries(result)) {
            // não sobrescreve valores já preenchidos pelo usuário
            if (!merged[k] || merged[k].trim() === "") merged[k] = val;
          }
          return { ...i, fieldValues: merged };
        }),
      );
      toast.success("Campos preenchidos automaticamente");
    } catch (e: any) {
      toast.error(e.message ?? "Falha no lookup");
    }
  }

  async function handleAutoFillAll(provider: "gemini" | "claude") {
    if (docTypeId === "none") return toast.error("Selecione o tipo de documento");
    if (fields.length === 0) return toast.error("Este tipo não tem campos de indexação");

    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return toast.error("Nenhum arquivo na fila");


    setIsExtracting(provider);
    setExtractStartedAt(new Date());
    cancelExtractRef.current = false;
    const fieldDefs = fields.map((f) => ({
      label: f.label,
      field_key: f.field_key,
      field_type: f.field_type,
      options: f.options,
      expected_length: f.expected_length ?? null,
      location_hint: f.location_hint ?? null,
    }));

    const fieldsJson = JSON.stringify(fieldDefs);
    const extractFn = provider === "claude" ? extractClaudeFn : extractGeminiFn;
    const providerLabel = provider === "claude" ? "Claude" : "Gemini";

    let ok = 0;
    let fail = 0;
    let incomplete = 0;
    let canceled = false;
    for (let idx = 0; idx < queued.length; idx++) {
      if (cancelExtractRef.current) {
        canceled = true;
        break;
      }
      const item = queued[idx];
      setBatchProgress({
        action: "extract",
        current: idx + 1,
        total: queued.length,
        fileName: item.file.name,
        itemId: item.id,
        sourcePath: item.sourcePath ?? normalizeManualSourcePath(manualSourcePathRef.current),
      });
      try {
        const form = new FormData();
        form.append("file", await compressImageIfNeeded(item.file));
        form.append("fields", fieldsJson);
        if (companyId !== "none") form.append("companyId", companyId);
        if (docTypeId !== "none") form.append("documentTypeId", docTypeId);
        const res = (await runExtractWithFreshAuth(extractFn, form)) as {
          values: Record<string, string>;
          usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model: string; log_id?: string | null };
        };
        // Normaliza os valores da IA com o mesmo sanitize aplicado ao digitar,
        // para que a baseline reflita o que ficaria salvo sem nenhuma edição.
        const sanitizedAi: Record<string, string> = {};
        for (const f of fields) {
          const v = res.values?.[f.field_key];
          if (v != null) sanitizedAi[f.field_key] = sanitizeFieldValue(f, String(v));
        }
        const mergedValues = { ...item.fieldValues, ...sanitizedAi };

        const missingRequired = fields.filter(
          (f) => f.required && !String(mergedValues[f.field_key] ?? "").trim(),
        );
        const isIncomplete = missingRequired.length > 0;
        if (isIncomplete) incomplete++;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  fieldValues: mergedValues,
                  aiOriginalValues: { ...sanitizedAi },

                  aiUsage: res.usage,
                  aiStatus: isIncomplete ? "incomplete" : "success",
                  aiProvider: provider,
                  aiMessage: isIncomplete
                    ? `Processamento incompleto — preencha manualmente: ${missingRequired
                        .map((f) => f.label)
                        .join(", ")}.`
                    : undefined,
                  expanded: true,
                }
              : i,
          ),
        );
        ok++;
      } catch (e: any) {
        fail++;
        const msg = e?.message ?? "Falha na extração";
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  aiStatus: "failed",
                  aiProvider: provider,
                  aiMessage: `Falha no processamento: ${msg}. Preencha os campos manualmente para enviar.`,
                  expanded: true,
                }
              : i,
          ),
        );
        toast.error(`${item.file.name}: ${msg}`);
      }
    }
    setIsExtracting(null);
    setBatchProgress(null);
    cancelExtractRef.current = false;
    if (canceled) {
      toast.info(`Processamento ${providerLabel} cancelado. ${ok} ok, ${incomplete} incompleto(s), ${fail} falha(s).`);
      return;
    }
    if (ok > 0 || fail > 0) {
      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} ok`);
      if (incomplete > 0) parts.push(`${incomplete} incompleto(s)`);
      if (fail > 0) parts.push(`${fail} falha(s)`);
      const summary = `Extração ${providerLabel}: ${parts.join(", ")}.`;
      if (fail > 0 || incomplete > 0) {
        toast.warning(`${summary} Itens marcados precisam de preenchimento manual antes do envio.`);
      } else {
        toast.success(`${summary} Revise antes de enviar.`);
      }
    }
  }



  async function reprocessItem(itemId: string, providerOverride?: "gemini" | "claude") {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    if (docTypeId === "none") return toast.error("Selecione o tipo de documento");
    if (fields.length === 0) return toast.error("Este tipo não tem campos de indexação");
    if (isExtracting !== null || isUploading) return;

    const provider = providerOverride ?? item.aiProvider ?? "gemini";
    const providerLabel = provider === "claude" ? "Claude" : "Gemini";
    const extractFn = provider === "claude" ? extractClaudeFn : extractGeminiFn;

    const fieldDefs = fields.map((f) => ({
      label: f.label,
      field_key: f.field_key,
      field_type: f.field_type,
      options: f.options,
      expected_length: f.expected_length ?? null,
      location_hint: f.location_hint ?? null,
    }));
    const fieldsJson = JSON.stringify(fieldDefs);

    setIsExtracting(provider);
    setExtractStartedAt(new Date());
    setBatchProgress({
      action: "extract",
      current: 1,
      total: 1,
      fileName: item.file.name,
      itemId: item.id,
      sourcePath: item.sourcePath ?? normalizeManualSourcePath(manualSourcePathRef.current),
    });

    try {
      const form = new FormData();
      form.append("file", await compressImageIfNeeded(item.file));
      form.append("fields", fieldsJson);
      if (companyId !== "none") form.append("companyId", companyId);
      if (docTypeId !== "none") form.append("documentTypeId", docTypeId);
      const res = (await runExtractWithFreshAuth(extractFn, form)) as {
        values: Record<string, string>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; model: string; log_id?: string | null };
      };
      const sanitizedAi: Record<string, string> = {};
      for (const f of fields) {
        const v = res.values?.[f.field_key];
        if (v != null) sanitizedAi[f.field_key] = sanitizeFieldValue(f, String(v));
      }
      const mergedValues = { ...item.fieldValues, ...sanitizedAi };
      const missingRequired = fields.filter(
        (f) => f.required && !String(mergedValues[f.field_key] ?? "").trim(),
      );
      const isIncomplete = missingRequired.length > 0;
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                fieldValues: mergedValues,
                aiOriginalValues: { ...sanitizedAi },
                aiUsage: res.usage,
                aiStatus: isIncomplete ? "incomplete" : "success",
                aiProvider: provider,
                aiMessage: isIncomplete
                  ? `Processamento incompleto — preencha manualmente: ${missingRequired
                      .map((f) => f.label)
                      .join(", ")}.`
                  : undefined,
                expanded: true,
              }
            : i,
        ),
      );
      if (isIncomplete) {
        toast.warning(`${providerLabel}: reprocessado com pendências.`);
      } else {
        toast.success(`${providerLabel}: reprocessado com sucesso.`);
      }
    } catch (e: any) {
      const msg = e?.message ?? "Falha na extração";
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                aiStatus: "failed",
                aiProvider: provider,
                aiMessage: `Falha no processamento: ${msg}. Preencha os campos manualmente para enviar.`,
                expanded: true,
              }
            : i,
        ),
      );
      toast.error(`${item.file.name}: ${msg}`);
    } finally {
      setIsExtracting(null);
      setBatchProgress(null);
    }
  }





  async function handleUploadAll() {
    if (!orgId || !userId) return toast.error("Organização não definida");
    if (companyId === "none") return toast.error("Selecione a empresa");
    if (docTypeId === "none") return toast.error("Selecione o tipo de documento");

    const queued = items.filter((i) => i.status === "queued");
    if (queued.length === 0) return;

    // Rola até o topo para acompanhar a barra de progresso.
    // Sobe por todos os ancestrais scrolláveis (window + <main> do app-shell).
    topAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => {
      let el: HTMLElement | null = topAnchorRef.current;
      while (el) {
        if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: "smooth" });
        el = el.parentElement;
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    for (const item of queued) {
      if (item.aiStatus === "failed") {
        toast.error(
          `${item.file.name}: ${item.aiMessage ?? "Falha no processamento — preencha manualmente antes de enviar."}`,
        );
        updateItem(item.id, { expanded: true });
        return;
      }
      for (const f of fields) {
        if (f.required && !String(item.fieldValues[f.field_key] ?? "").trim()) {
          toast.error(`${item.file.name}: campo obrigatório "${f.label}"`);
          updateItem(item.id, { expanded: true });
          return;
        }
      }
    }


    setIsUploading(true);
    setUploadStartedAt(new Date());



    for (let idx = 0; idx < queued.length; idx++) {
      const item = queued[idx];
      setBatchProgress({
        action: "upload",
        current: idx + 1,
        total: queued.length,
        fileName: item.file.name,
        itemId: item.id,
        sourcePath: item.sourcePath ?? normalizeManualSourcePath(manualSourcePathRef.current),
      });
      const err = validateFile(item.file);
      if (err) {
        updateItem(item.id, { status: "error", error: err });
        continue;
      }
      updateItem(item.id, { status: "uploading", progress: 0 });
      try {
        await uploadDocument({
          file: item.file,
          orgId,
          userId,
          name: item.file.name,
          documentTypeId: docTypeId,
          companyId,
          fieldValues: item.fieldValues,
          sourcePath: item.sourcePath ?? normalizeManualSourcePath(manualSourcePathRef.current),
          aiUsage: item.aiUsage ?? undefined,
          onProgress: (pct) => updateItem(item.id, { progress: pct }),
        });

        updateItem(item.id, { status: "done", progress: 100 });

        // Soma de caracteres corrigidos manualmente vs. extração da IA
        const logId = item.aiUsage?.log_id;
        if (logId && item.aiOriginalValues) {
          const original = item.aiOriginalValues;
          const final = item.fieldValues;
          let correctedChars = 0;
          const keys = new Set([...Object.keys(original), ...Object.keys(final)]);
          for (const k of keys) {
            const a = original[k] == null ? "" : String(original[k]);
            const b = final[k] == null ? "" : String(final[k]);
            if (a !== b) correctedChars += charDiff(a, b);
          }
          const extractedChars = Object.values(original).reduce(
            (sum, v) => sum + (v == null ? 0 : String(v).length),
            0,
          );
          const { data: logRow } = await supabase
            .from("ai_usage_logs")
            .select("corrected_chars, extracted_chars")
            .eq("id", logId)
            .maybeSingle();
          await supabase
            .from("ai_usage_logs")
            .update({
              corrected_chars: (logRow?.corrected_chars ?? 0) + correctedChars,
              extracted_chars: (logRow?.extracted_chars ?? 0) + extractedChars,
            })
            .eq("id", logId);
        }
      } catch (e: any) {
        updateItem(item.id, { status: "error", error: e.message ?? "Erro" });
      }
    }

    setIsUploading(false);
    setBatchProgress(null);
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["ai-usage-logs"] });
    toast.success("Upload finalizado");
  }

  function clearDone() {
    setItems((p) => p.filter((i) => i.status !== "done"));
  }

  function clearAll() {
    if (isUploading) return;
    if (!confirm("Remover todos os arquivos da fila?")) return;
    setItems([]);
  }

  const queuedCount = items.filter((i) => i.status === "queued").length;
  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div ref={topAnchorRef} aria-hidden className="scroll-mt-4" />
      <header className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 p-4 md:p-5">
        <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-blue-800/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-slate-700/20 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 backdrop-blur px-2.5 py-0.5 text-xs font-medium text-muted-foreground mb-2">
            <Upload className="h-3.5 w-3.5 text-blue-800" />
            Novo lote
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 bg-clip-text text-transparent">
            Upload de documentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Selecione empresa e tipo, arraste ou clique no botão para adicionar as imagens e depois escolha qual a IA de sua preferência ou preencha a indexação de cada arquivo individualmente.
          </p>
        </div>
      </header>

      {batchProgress && (
        <div className="sticky top-2 z-30 rounded-xl border border-blue-300/60 bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-600 p-3 shadow-lg shadow-blue-500/30 text-white">
          {(extractStartedAt || uploadStartedAt) && (
            <div className="mb-2 flex flex-wrap justify-end gap-x-4 gap-y-0.5 text-[11px] font-medium tabular-nums text-white/90">
              {extractStartedAt && (
                <span>
                  Início processamento:{" "}
                  {extractStartedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                </span>
              )}
              {uploadStartedAt && (
                <span>
                  Início envio:{" "}
                  {uploadStartedAt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            <div className="min-w-0 flex-1">
              <p
                className="text-base sm:text-lg font-semibold truncate flex items-center gap-2"
                title={batchProgress.sourcePath ?? "Sem diretório (arquivo solto)"}
              >
                <FolderOpen className="h-5 w-5 shrink-0" />
                <span className="truncate">
                  {batchProgress.sourcePath ?? "— sem diretório —"}
                </span>
              </p>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider mt-1 min-w-0">
                <span className="shrink-0">
                  {batchProgress.action === "extract" ? "Processando IA" : "Enviando arquivo"}
                  {" · "}
                  {batchProgress.current} de {batchProgress.total}
                </span>
                <span className="truncate text-xs font-semibold normal-case tracking-normal text-white/90" title={batchProgress.fileName}>
                  · {batchProgress.fileName}
                </span>
                <span className="ml-auto tabular-nums shrink-0">
                  {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                </span>
              </div>

              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                <div
                  className="h-full rounded-full bg-white transition-all"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>

            </div>
          </div>
        </div>
      )}

      {!batchProgress && items.length > 0 && (() => {
        const total = items.length;
        const done = doneCount;
        const errors = errorCount;
        const queued = queuedCount;
        const processed = done + errors;
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
        const folders = Array.from(
          new Set(items.map((i) => i.sourcePath).filter((p): p is string => !!p)),
        );
        const folderLabel =
          folders.length === 0
            ? "— sem diretório —"
            : folders.length === 1
              ? folders[0]
              : `${folders.length} pastas selecionadas`;
        return (
          <div className="sticky top-2 z-30 rounded-xl border border-blue-300/60 bg-gradient-to-r from-indigo-600/90 via-blue-600/90 to-sky-600/90 p-3 shadow-lg shadow-blue-500/30 text-white">
            <div className="flex items-center gap-3">
              <FolderOpen className="h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-base sm:text-lg font-semibold truncate" title={folderLabel}>
                  {folderLabel}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold uppercase tracking-wider mt-1">
                  <span>Total: {total}</span>
                  <span>Na fila: {queued}</span>
                  <span>Finalizados: {done}</span>
                  {errors > 0 && <span>Erros: {errors}</span>}
                  <span className="ml-auto tabular-nums">{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-2.5 border-0 bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20">
            <div className="relative flex items-center justify-center">
              <span className="text-[11px] font-medium text-white/85 uppercase tracking-wider">Total</span>
              <FileText className="absolute right-0 h-3.5 w-3.5 text-white/90" />
            </div>
            <p className="text-2xl font-display font-bold mt-1 tabular-nums leading-tight text-center">{items.length}</p>
          </Card>
          <Card className="p-2.5 border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
            <div className="relative flex items-center justify-center">
              <span className="text-[11px] font-medium text-white/85 uppercase tracking-wider">Na fila</span>
              <Upload className="absolute right-0 h-3.5 w-3.5 text-white/90" />
            </div>
            <p className="text-2xl font-display font-bold mt-1 tabular-nums leading-tight text-center">{queuedCount}</p>
          </Card>
          <Card className="p-2.5 border-0 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
            <div className="relative flex items-center justify-center">
              <span className="text-[11px] font-medium text-white/85 uppercase tracking-wider">Enviados</span>
              <CheckCircle2 className="absolute right-0 h-3.5 w-3.5 text-white/90" />
            </div>
            <p className="text-2xl font-display font-bold mt-1 tabular-nums leading-tight text-center">{doneCount}</p>
          </Card>
          <Card className="p-2.5 border-0 bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-lg shadow-rose-500/20">
            <div className="relative flex items-center justify-center">
              <span className="text-[11px] font-medium text-white/85 uppercase tracking-wider">Falhas</span>
              <AlertCircle className="absolute right-0 h-3.5 w-3.5 text-white/90" />
            </div>
            <p className="text-2xl font-display font-bold mt-1 tabular-nums leading-tight text-center">{errorCount}</p>
          </Card>

        </div>
      )}


      <Card className="p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Empresa *</Label>
            <Select
              value={companyId}
              onValueChange={(v) => {
                setCompanyId(v);
                setDocTypeId("none");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione...</SelectItem>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipo do documento *</Label>
            <Select
              value={docTypeId}
              onValueChange={(v) => {
                setDocTypeId(v);
              }}
              disabled={companyId === "none"}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    companyId === "none" ? "Selecione a empresa primeiro" : "Selecionar"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Selecione...</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Diretório (opcional — aplicado a arquivos soltos ou selecionados)
          </label>
          <input
            type="text"
            value={manualSourcePath}
            onChange={(e) => {
              const next = e.target.value;
              setManualSourcePath(next);
              const previousManual = normalizeManualSourcePath(manualSourcePathRef.current);
              const trimmed = normalizeManualSourcePath(next);
              setItems((prev) =>
                prev.map((it) =>
                  it.status === "queued" && (!it.sourcePath || it.sourcePath === "." || it.sourcePath === previousManual)
                    ? { ...it, sourcePath: trimmed || null }
                    : it,
                ),
              );
            }}
            placeholder="ex.: Financeiro/2026/Notas"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={isUploading}
          />
        </div>


        <div
          {...getRootProps()}
          className={`relative overflow-hidden border-2 border-dashed rounded-xl px-4 py-3 cursor-pointer transition-all ${
            isDragActive
              ? "border-blue-800 bg-gradient-to-br from-slate-900/10 via-blue-900/10 to-sky-700/10 scale-[1.01]"
              : "border-blue-700/40 hover:border-blue-800/60 hover:bg-gradient-to-br hover:from-slate-900/5 hover:via-blue-900/5 hover:to-sky-700/5"
          } ${isUploading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <input {...getInputProps()} />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-500 grid place-items-center shadow-md shadow-blue-800/30">
              <Upload className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-semibold text-sm truncate">
                {isDragActive ? "Solte os arquivos aqui" : "Arraste arquivos ou clique para selecionar"}
              </p>
              <p className="text-xs text-muted-foreground">PDF, JPG, PNG</p>
            </div>
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || companyId === "none" || docTypeId === "none"}
                title={
                  companyId === "none" || docTypeId === "none"
                    ? "Selecione a empresa e o tipo de documento primeiro"
                    : undefined
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (companyId === "none" || docTypeId === "none") {
                    toast.error("Selecione a empresa e o tipo de documento primeiro");
                    return;
                  }
                  folderInputRef.current?.click();
                }}
              >
                <Upload className="h-4 w-4 mr-1" />
                Selecionar pasta
              </Button>
              <input
                ref={folderInputRef}
                type="file"
                hidden
                multiple
                // @ts-expect-error - webkitdirectory is non-standard but widely supported
                webkitdirectory=""
                directory=""
                onChange={(e) => {
                  const all = Array.from(e.target.files ?? []);
                  const accepted: File[] = [];
                  const rejected: { file: File; errors: { message: string }[] }[] = [];
                  all.forEach((f) => {
                    if (!ALLOWED_MIME.includes(f.type)) {
                      rejected.push({ file: f, errors: [{ message: "tipo não suportado" }] });
                    } else if (f.size > 50 * 1024 * 1024) {
                      rejected.push({ file: f, errors: [{ message: "excede 50 MB" }] });
                    } else {
                      accepted.push(f);
                    }
                  });
                  onDrop(accepted, rejected);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

        </div>


        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-sm">{items.length} arquivo(s) na fila</h3>
              <div className="flex gap-2 flex-wrap">
                {items.some((i) => i.status === "done") && (
                  <Button size="sm" variant="ghost" onClick={clearDone}>
                    Limpar finalizados
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearAll}
                  disabled={isUploading}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  title="Remove todos os arquivos da fila"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpar fila
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAutoFillAll("gemini")}
                  disabled={
                    isExtracting !== null ||
                    isUploading ||
                    docTypeId === "none" ||
                    fields.length === 0 ||
                    !items.some((i) => i.status === "queued")
                  }
                  title="Lê a 1ª página de cada arquivo e preenche os campos via Gemini IA"
                  className="group relative overflow-hidden bg-gradient-to-r from-slate-800 via-blue-800 to-sky-700 hover:from-indigo-700 hover:via-blue-600 hover:to-cyan-500 text-white border-0 shadow-md shadow-blue-800/30 hover:shadow-lg hover:shadow-sky-500/50 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                  {isExtracting === "gemini" ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110 group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                  )}
                  <span className="relative">Preencher com Gemini</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAutoFillAll("claude")}
                  disabled={
                    isExtracting !== null ||
                    isUploading ||
                    docTypeId === "none" ||
                    fields.length === 0 ||
                    !items.some((i) => i.status === "queued")
                  }
                  title="Lê a 1ª página de cada arquivo e preenche os campos via Claude Haiku 4.5"
                  className="group relative overflow-hidden bg-gradient-to-r from-orange-700 via-amber-700 to-rose-700 hover:from-orange-600 hover:via-amber-600 hover:to-rose-600 text-white border-0 shadow-md shadow-amber-700/30 hover:shadow-lg hover:shadow-amber-500/50 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full" />
                  {isExtracting === "claude" ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-1 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110 group-hover:drop-shadow-[0_0_6px_rgba(255,255,255,0.9)]" />
                  )}
                  <span className="relative">Preencher com Claude</span>
                </Button>
                {isExtracting !== null && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      cancelExtractRef.current = true;
                      toast.info("Cancelando após o arquivo atual...");
                    }}
                    disabled={cancelExtractRef.current}
                    title="Interrompe o preenchimento por IA após o arquivo atual"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Cancelar IA
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleUploadAll}
                  disabled={isUploading || !items.some((i) => i.status === "queued")}
                  className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md shadow-indigo-500/30"
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Enviar {items.filter((i) => i.status === "queued").length} arquivo(s)
                </Button>
              </div>
            </div>
            <ul className="divide-y divide-border rounded-md border border-border">
              {items.map((item) => {
                const isProcessing = batchProgress?.itemId === item.id;
                return (
                <li
                  key={item.id}
                  className={cn(
                    "p-3 space-y-2 transition-colors",
                    isProcessing && "bg-blue-50 dark:bg-blue-950/30 ring-2 ring-inset ring-blue-500/60 animate-pulse",
                  )}
                >
                  <div className="flex items-center gap-3">
                    {isProcessing ? (
                      <Loader2 className="h-5 w-5 text-blue-600 shrink-0 animate-spin" />
                    ) : item.file.type.startsWith("image/") ? (
                      <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                    ) : (
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{item.file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatBytes(item.file.size)}
                        </span>
                        {isProcessing && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded shrink-0 whitespace-nowrap">
                            {batchProgress?.action === "extract" ? "Processando IA" : "Enviando…"}
                          </span>
                        )}
                      </div>

                      {item.status === "uploading" && (
                        <Progress value={item.progress} className="h-1 mt-1.5" />
                      )}
                      {item.status === "error" && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {item.error}
                        </p>
                      )}
                      {item.status !== "error" && item.aiStatus === "failed" && (
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <p className="text-xs text-destructive flex items-center gap-1 min-w-0">
                            <AlertCircle className="h-3 w-3 shrink-0" /> {item.aiMessage}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0"
                            onClick={() => reprocessItem(item.id)}
                            disabled={isExtracting !== null || isUploading}
                            title={`Reprocessar com ${item.aiProvider === "claude" ? "Claude" : "Gemini"}`}
                          >
                            {isExtracting !== null && batchProgress?.itemId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            )}
                            Reprocessar
                          </Button>
                        </div>
                      )}
                      {item.status !== "error" && item.aiStatus === "incomplete" && (
                        <div className="mt-1 flex items-start justify-between gap-2">
                          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 min-w-0">
                            <AlertCircle className="h-3 w-3 shrink-0" /> {item.aiMessage}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0"
                            onClick={() => reprocessItem(item.id)}
                            disabled={isExtracting !== null || isUploading}
                            title={`Reprocessar com ${item.aiProvider === "claude" ? "Claude" : "Gemini"}`}
                          >
                            {isExtracting !== null && batchProgress?.itemId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                            )}
                            Reprocessar
                          </Button>
                        </div>
                      )}

                    </div>
                    {item.status === "done" && (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    )}
                    {item.status !== "done" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => updateItem(item.id, { expanded: !item.expanded })}
                        className="h-7 w-7"
                        title="Pré-visualizar e editar indexação"
                      >
                        {item.expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                    {item.status !== "done" && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeItem(item.id)}
                        className="h-7 w-7"
                        title="Remover do lote"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {item.expanded && item.status !== "done" && (
                    <div className="pl-8 pt-2 space-y-3 border-t">
                      <div className="grid lg:grid-cols-[1fr_300px] gap-4 pt-2">
                        <ZoomablePreview>
                          {item.file.type.startsWith("image/") ? (
                            <img
                              src={item.previewUrl}
                              alt={item.file.name}
                              className="max-h-[420px] max-w-full object-contain"
                            />
                          ) : item.file.type === "application/pdf" ? (
                            <div className="w-[800px] h-[420px]">
                              <PdfFilePreview file={item.file} />
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground p-4 text-center">
                              Pré-visualização indisponível para este tipo de arquivo.
                            </div>
                          )}
                        </ZoomablePreview>
                        <div className="space-y-3">
                          {fields.length > 0 ? (
                            <FieldEditor
                              fields={fields}
                              values={item.fieldValues}
                              onChange={(k, v) => setItemFieldValue(item.id, k, v)}
                              onFieldBlur={(k, v) => handleKeyFieldBlur(item.id, k, v)}
                              idPrefix={item.id}
                              originals={item.aiOriginalValues}
                              aiRan={!!item.aiStatus}

                            />


                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Selecione um tipo de documento para preencher a indexação.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
            <div className="sticky bottom-4 z-10 mt-4 flex justify-end">
              <Button
                size="sm"
                onClick={handleUploadAll}
                disabled={isUploading || !items.some((i) => i.status === "queued")}
                className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-md shadow-indigo-500/30"
              >
                <Upload className="h-4 w-4 mr-1" />
                Enviar {items.filter((i) => i.status === "queued").length} arquivo(s)
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

