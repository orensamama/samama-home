// In-browser OCR (tesseract.js, loaded only when used) for photos of recipe pages.

const OCR_MAX_SIDE = 2400;

/**
 * Phone photos are huge and noisy; a downscaled grayscale, higher-contrast
 * copy is faster to scan and usually reads better. Falls back to the original
 * file if the browser can't do it.
 */
export async function prepareImageForOcr(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, OCR_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.filter = "grayscale(1) contrast(1.25)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob ?? file), "image/png"));
  } catch {
    return file;
  }
}

/** Reads the Hebrew/English text out of a photo. Throws if the engine can't load (e.g. offline). */
export async function readTextFromImage(file: File): Promise<string> {
  const image = await prepareImageForOcr(file);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("heb+eng");
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** A recipe photo for storage: longest side 1200px, JPEG. */
export async function resizeForUpload(file: File, maxSide = 1200): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("encode failed");
  return blob;
}
