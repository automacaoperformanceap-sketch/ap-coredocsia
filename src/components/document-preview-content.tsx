import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PdfPreview } from "@/components/pdf-preview";
import type { DocumentRow } from "@/lib/documents";

export interface DocumentPreviewContentProps {
  doc: DocumentRow;
  url: string | null;
  fileData: ArrayBuffer | null;
  loading: boolean;
  scrollable?: boolean;
}

export function DocumentPreviewContent({
  doc,
  url,
  fileData,
  loading,
  scrollable = false,
}: DocumentPreviewContentProps) {
  const isImage = doc.mime_type.startsWith("image/");
  const isPdf = doc.mime_type === "application/pdf";

  return (
    <div
      className={cn(
        "flex-1 w-full relative min-h-0",
        scrollable
          ? "overflow-auto flex items-start justify-center"
          : "h-full overflow-hidden grid place-items-center",
      )}
    >
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/30 z-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      {!loading && !url && (
        <div className="text-center text-muted-foreground p-6">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
          Não foi possível carregar a pré-visualização
        </div>
      )}
      {url && isImage && (
          <div
            className={cn(
              "w-full flex justify-center p-4",
              scrollable ? "items-start pt-12 pb-8" : "h-full items-center",
            )}
          >
          <img
            src={url}
            alt={doc.name}
            className={cn(
              "max-w-full object-contain shadow-sm",
              scrollable ? "h-auto" : "max-h-full",
            )}
          />
        </div>
      )}
      {url && isPdf && fileData && <PdfPreview data={fileData} title={doc.name} />}
      {url && !isImage && !isPdf && (
        <div className="text-center text-muted-foreground p-6">
          <FileText className="h-10 w-10 mx-auto mb-2 opacity-20" />
          Formato sem pré-visualização. Use "Baixar".
        </div>
      )}
    </div>
  );
}