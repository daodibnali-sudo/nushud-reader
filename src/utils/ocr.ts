import { createWorker, type Worker } from "tesseract.js";
import type { OcrResult } from "../types";

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
 *
 * pageWidth/pageHeight (the source image's pixel dimensions) are needed to convert
 * Tesseract's pixel-coordinate word boxes (data.words[].bbox) into percentages, so the
 * tappable overlay stays aligned however large the page image is actually displayed.
 */
export async function recognizeArabicText(
  imageSource: string,
  pageWidth: number,
  pageHeight: number,
  dpi = 300,
): Promise<OcrResult> {
  const worker = await getWorker();
  await worker.setParameters({ user_defined_dpi: String(dpi) });
  const { data } = await worker.recognize(imageSource);

  const words = (data.words ?? []).map((word) => ({
    text: word.text,
    xPct: (word.bbox.x0 / pageWidth) * 100,
    yPct: (word.bbox.y0 / pageHeight) * 100,
    widthPct: ((word.bbox.x1 - word.bbox.x0) / pageWidth) * 100,
    heightPct: ((word.bbox.y1 - word.bbox.y0) / pageHeight) * 100,
  }));

  return { text: data.text, words };
}
