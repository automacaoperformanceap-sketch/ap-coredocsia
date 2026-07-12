/**
 * Converte a PRIMEIRA PÁGINA de um PDF em um File JPEG (client-side),
 * usado quando o provider de IA (ex.: Grok) só aceita imagens.
 */
export async function pdfFirstPageToJpeg(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  const maxDimension = opts.maxDimension ?? 1600;
  const quality = opts.quality ?? 0.85;

  if (file.type !== "application/pdf") return file;
  if (typeof document === "undefined") return file;

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: buf.slice(0),
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const largest = Math.max(baseViewport.width, baseViewport.height);
    const scale = largest > maxDimension ? maxDimension / largest : 2;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D indisponível");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Falha ao gerar JPEG do PDF");

    const newName = file.name.replace(/\.pdf$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}
