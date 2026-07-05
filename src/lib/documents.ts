import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";


export type DocStatus = Database["public"]["Enums"]["doc_status"];
export type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
export type DocumentTypeRow = Database["public"]["Tables"]["document_types"]["Row"];

export const ALLOWED_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
];
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES_PER_BATCH = 500;

export function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_BYTES) return "Arquivo excede 50 MB";
  if (!ALLOWED_MIME.includes(file.type)) return "Tipo de arquivo não suportado";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export const STATUS_LABEL: Record<DocStatus, string> = {
  pending: "Pendente",
  processing: "Processando",
  processed: "Processado",
  failed: "Falhou",
};

/**
 * Retorna URL para visualizar/baixar o arquivo. Usa a rota TanStack
 * /api/public/files/$id que faz proxy autenticado para o Google Drive.
 */
export async function getFileUrl(
  documentId: string,
  opts: { download?: boolean } = {},
): Promise<string | null> {
  let { data: sessionData } = await supabase.auth.getSession();
  let token = sessionData.session?.access_token;
  const exp = sessionData.session?.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!token || exp - nowSec < 120) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token ?? token;
  }
  if (!token) return null;
  const qs = new URLSearchParams({ token });
  if (opts.download) qs.set("download", "1");
  return `/api/public/files/${documentId}?${qs.toString()}`;
}

async function refreshAuthSessionIfNeeded(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const exp = sessionData.session?.expires_at ?? 0;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!sessionData.session || exp - nowSec < 300) {
    await supabase.auth.refreshSession();
  }
}

function isInvalidAuthTokenError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Unauthorized:\s*Invalid token/i.test(message);
}

function isTransientNetworkError(error: unknown): boolean {
  // TypeError: Failed to fetch / Load failed / NetworkError when attempting to fetch resource
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /Failed to fetch|Load failed|NetworkError|network error|ERR_NETWORK|ECONNRESET|socket hang up/i.test(
    message,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


export interface UploadOptions {
  file: File;
  orgId: string;
  userId: string;
  name: string;
  documentTypeId: string;
  companyId: string;
  fieldValues?: Record<string, unknown>;
  tags?: string[];
  sourcePath?: string | null;
  aiUsage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; model?: string; log_id?: string | null };
  onProgress?: (pct: number) => void;
}


export async function uploadDocument(opts: UploadOptions): Promise<DocumentRow> {
  const { file, name, documentTypeId, companyId, fieldValues, tags = [], aiUsage, sourcePath } = opts;

  opts.onProgress?.(10);

  // Garante um token válido antes do envio (processamento longo pode expirar o JWT).
  await refreshAuthSessionIfNeeded();

  const { uploadDocumentToDrive } = await import("./drive.functions");

  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("companyId", companyId);
  form.append("documentTypeId", documentTypeId);
  form.append("tags", tags.join(","));
  form.append("fieldValues", JSON.stringify(fieldValues ?? {}));
  if (sourcePath) form.append("sourcePath", sourcePath);
  if (aiUsage) {
    form.append("aiUsage", JSON.stringify(aiUsage));
  }

  opts.onProgress?.(40);
  const MAX_ATTEMPTS = 3;
  let row: unknown;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      row = await uploadDocumentToDrive({ data: form });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (isInvalidAuthTokenError(error)) {
        await supabase.auth.refreshSession();
        continue;
      }
      if (isTransientNetworkError(error) && attempt < MAX_ATTEMPTS) {
        await sleep(500 * attempt);
        continue;
      }
      throw error;
    }
  }
  if (lastError) throw lastError;
  opts.onProgress?.(100);
  return row as DocumentRow;
}




