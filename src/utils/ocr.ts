import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

/**
 * Free, client-side OCR (no API cost) via Tesseract.js. Reused across pages/files in a
 * session so the Arabic model is only downloaded once. Weaker than a vision-model OCR at
 * reading harakat/diacritics, but it doesn't cost anything to run.
 */
function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("ara");
  }
  return workerPromise;
}

/**
 * dpi defaults to 300 (the standard "good scan" assumption) for direct image uploads,
 * where the actual DPI is unknowable from the file alone. extractText.ts passes the real
 * effective DPI for PDF pages it rasterizes itself. Telling Tesseract the DPI explicitly
 * matters here specifically because canvas-rendered/re-encoded images carry no DPI
 * metadata for it to detect on its own, which otherwise measurably hurts accuracy.
 */
export async function recognizeArabicText(imageSource: string, dpi = 300): Promise<string> {
  const worker = await getWorker();
  await worker.setParameters({ user_defined_dpi: String(dpi) });
  const {
    data: { text },
  } = await worker.recognize(imageSource);
  return text;
}
