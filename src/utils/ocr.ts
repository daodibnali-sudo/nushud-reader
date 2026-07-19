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

export async function recognizeArabicText(imageSource: string): Promise<string> {
  const worker = await getWorker();
  const {
    data: { text },
  } = await worker.recognize(imageSource);
  return text;
}
