/**
 * Compressão client-side de imagens antes de enviar para a IA.
 * Reduz o número de tokens de input do Gemini (cobrado por "tile" ~768px).
 *
 * - Só atua em imagens rasterizáveis (JPEG/PNG/WEBP/HEIC quando o browser suporta).
 * - PDFs e outros formatos passam sem alteração.
 * - Redimensiona mantendo proporção, com lado maior = MAX_DIMENSION.
 * - Reencoda como JPEG qualidade 0.82.
 * - Se o resultado ficar MAIOR que o original, mantém o original.
 */

// Gemini fatura por tile de 768px. 1024 mantém 2x2 tiles (~1.100 tokens)
// contra 3x3 (~2.100) quando usávamos 1600. OCR de campos de indexação
// permanece legível nesse tamanho.
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.82;
const COMPRESSIBLE_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file || !COMPRESSIBLE_TYPES.test(file.type)) return file;
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const largest = Math.max(width, height);
    const scale = largest > MAX_DIMENSION ? MAX_DIMENSION / largest : 1;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(png|webp|heic|heif|jpe?g)$/i, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
