/**
 * Recorte horizontal simples de imagens rasterizáveis (JPEG/PNG/WEBP).
 * - "top": mantém a metade superior (0% → 50%)
 * - "bottom": mantém a metade inferior (50% → 100%)
 * - "none": retorna o arquivo original inalterado
 *
 * Arquivos não-imagem passam sem alteração.
 */
export type CropMode = "none" | "top" | "bottom";

const CROPPABLE_TYPES = /^image\/(jpeg|jpg|png|webp)$/i;

export async function cropImageHalf(file: File, mode: CropMode): Promise<File> {
  if (!file || mode === "none") return file;
  if (!CROPPABLE_TYPES.test(file.type)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const halfH = Math.floor(height / 2);
    if (halfH <= 0) {
      bitmap.close?.();
      return file;
    }
    const sy = mode === "bottom" ? height - halfH : 0;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = halfH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, halfH);
    ctx.drawImage(bitmap, 0, sy, width, halfH, 0, 0, width, halfH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) return file;

    const suffix = mode === "top" ? "-topo" : "-base";
    const newName = file.name.replace(/\.(png|webp|jpe?g)$/i, "") + `${suffix}.jpg`;
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
