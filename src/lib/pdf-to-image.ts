/**
 * Converte as N primeiras páginas de um PDF em um File JPEG (client-side),
 * empilhando as páginas verticalmente em uma única imagem. Usado quando o
 * provider de IA (ex.: Grok) só aceita imagens, ou quando queremos limitar
 * a leitura a um número fixo de páginas para todos os providers.
 */
export async function pdfPagesToJpeg(
  file: File,
  opts: { maxPages?: number; maxDimension?: number; quality?: number } = {},
): Promise<File> {
  const maxPages = Math.max(1, Math.floor(opts.maxPages ?? 1));
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
    const total = Math.min(maxPages, pdf.numPages);
    const rendered: { canvas: HTMLCanvasElement; width: number; height: number }[] = [];

    for (let p = 1; p <= total; p++) {
      const page = await pdf.getPage(p);
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
      rendered.push({ canvas, width: canvas.width, height: canvas.height });
    }

    // Empilha verticalmente as páginas em um único canvas.
    const finalWidth = Math.max(...rendered.map((r) => r.width));
    const gap = rendered.length > 1 ? 16 : 0;
    const finalHeight = rendered.reduce((sum, r) => sum + r.height, 0) + gap * (rendered.length - 1);

    const composite = document.createElement("canvas");
    composite.width = finalWidth;
    composite.height = finalHeight;
    const cctx = composite.getContext("2d");
    if (!cctx) throw new Error("Canvas 2D indisponível");
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, composite.width, composite.height);

    let y = 0;
    for (const r of rendered) {
      const x = Math.floor((finalWidth - r.width) / 2);
      cctx.drawImage(r.canvas, x, y);
      y += r.height + gap;
    }

    const blob: Blob | null = await new Promise((resolve) =>
      composite.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Falha ao gerar JPEG do PDF");

    const suffix = total > 1 ? `-p1-${total}` : "";
    const newName = file.name.replace(/\.pdf$/i, "") + `${suffix}.jpg`;
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  }
}

/** Alias legado — mantido por compatibilidade (equivale a maxPages=1). */
export async function pdfFirstPageToJpeg(
  file: File,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<File> {
  return pdfPagesToJpeg(file, { ...opts, maxPages: 1 });
}
