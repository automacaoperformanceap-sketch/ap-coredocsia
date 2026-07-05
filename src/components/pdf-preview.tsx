import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PdfPreviewProps {
  data: ArrayBuffer;
  title: string;
}

export function PdfPreview({ data, title }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfRef = useRef<any>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [numPages, setNumPages] = useState(0);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    let loadingTask: any = null;

    async function loadPdf() {
      setIsRendering(true);
      setFailed(false);
      setPageNumber(1);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        loadingTask = pdfjs.getDocument({
          data: data.slice(0),
          isOffscreenCanvasSupported: false,
          isImageDecoderSupported: false,
          useWorkerFetch: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await loadingTask.destroy();
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error("Falha ao carregar PDF", error);
        if (!cancelled) setFailed(true);
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
      if (pdfRef.current) {
        pdfRef.current.destroy?.();
        pdfRef.current = null;
      }
    };
  }, [data]);

  // Render current page
  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;

    async function renderPage() {
      const pdf = pdfRef.current;
      const canvas = canvasRef.current;
      if (!pdf || !canvas) return;
      setIsRendering(true);
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const containerWidth = canvas.parentElement?.clientWidth ?? 900;
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / baseViewport.width, 1.8);
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas indisponível");

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch (error: any) {
        if (error?.name !== "RenderingCancelledException") {
          console.error("Falha ao renderizar PDF", error);
          if (!cancelled) setFailed(true);
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }

    renderPage();
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel?.();
    };
  }, [pageNumber, numPages]);

  const canPrev = pageNumber > 1;
  const canNext = pageNumber < numPages;

  return (
    <div className="relative w-full h-full flex flex-col bg-muted/40">
      {numPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-border bg-card">
          <Button
            size="sm"
            variant="outline"
            disabled={!canPrev}
            onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            Página {pageNumber} de {numPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={!canNext}
            onClick={() => setPageNumber((p) => Math.min(numPages, p + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-auto p-4">
        <div className="min-h-full grid place-items-start justify-center relative">
          {isRendering && (
            <div className="absolute inset-0 grid place-items-center bg-muted/30 z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {failed ? (
            <div className="max-w-sm text-center text-sm text-muted-foreground p-6">
              <p>Não foi possível renderizar a página do PDF.</p>
              <p className="mt-1">Use “Baixar” para abrir o arquivo original.</p>
            </div>
          ) : (
            <canvas ref={canvasRef} aria-label={title} className="max-w-full bg-card shadow-sm" />
          )}
        </div>
      </div>
    </div>
  );
}
