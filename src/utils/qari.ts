import type { OcrResult, OcrWordBox } from "../types";
import { recognizeArabicText } from "./ocr";
import { arabicLetterCount } from "./arabicText";
import { detectWordBoxes } from "./wordBoxes";

/**
 * QARI-OCR (arXiv:2506.02295) is a vision-language model that reads harakat far better than
 * Tesseract, but it needs a server. Production uses the public CPU gateway on our laptop
 * (qari-server/gateway.py, via a Cloudflare Tunnel), which only reads single clicked words.
 * Locally, VITE_QARI_OCR_URL can point anywhere (e.g. the Mac server in qari-server/server.py).
 * When the server is off or unreachable the app simply doesn't offer QARI and uses Tesseract.
 */
const qariOcrUrl: string =
  import.meta.env.VITE_QARI_OCR_URL || (import.meta.env.DEV ? "http://127.0.0.1:8765" : "https://qari.nushud.com");

export async function isQariAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${qariOcrUrl}/health`, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Locates every word on the page without reading any of them (see wordBoxes.ts), and labels
 * each box with Tesseract's guess so the document still has text before a word is clicked.
 * The page is shown immediately; QARI reads a word only when the visitor clicks it.
 */
export async function locateWordsForQari(
  dataUrl: string,
  pageWidth: number,
  pageHeight: number,
  dpi: number,
): Promise<OcrResult> {
  const [boxes, guesses] = await Promise.all([
    detectBoxes(dataUrl, pageWidth, pageHeight),
    recognizeArabicText(dataUrl, pageWidth, pageHeight, dpi),
  ]);

  const readable = guesses.words.filter((word) => arabicLetterCount(word.text) >= 2);
  const words: OcrWordBox[] = boxes.map((box) => {
    const inside = readable.filter((word) => {
      const centerX = word.xPct + word.widthPct / 2;
      const centerY = word.yPct + word.heightPct / 2;
      return (
        centerX >= box.xPct &&
        centerX <= box.xPct + box.widthPct &&
        centerY >= box.yPct &&
        centerY <= box.yPct + box.heightPct
      );
    });
    // Arabic reads right to left, so the rightmost guess comes first.
    const text = inside
      .sort((a, b) => b.xPct - a.xPct)
      .map((word) => word.text)
      .join(" ");
    return { ...box, text, needsRead: true };
  });

  return { text: guesses.text, words };
}

async function detectBoxes(dataUrl: string, width: number, height: number): Promise<OcrWordBox[]> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is not supported in this browser.");
  context.drawImage(image, 0, 0, width, height);

  return detectWordBoxes(context.getImageData(0, 0, width, height)).map((box) => ({
    text: "",
    xPct: (box.x0 / width) * 100,
    yPct: (box.y0 / height) * 100,
    widthPct: ((box.x1 - box.x0) / width) * 100,
    heightPct: ((box.y1 - box.y0) / height) * 100,
  }));
}

/** QARI reads best when the word's crop is about this many pixels tall (found by testing). */
const targetCropHeight = 216;
const maxCropScale = 4;
const maxCropPixels = 500_000;
const cropPadding = 6;

/**
 * Reads one word box with QARI. The crop spans the box's full height (so harakat above and
 * below are included) and is scaled to a size the model handles well: QARI was trained on
 * whole pages, and at a word's native size it sees too few image tokens (bigger than ~3-4x
 * got worse in testing too).
 */
export async function readWordWithQari(imageDataUrl: string, box: OcrWordBox): Promise<string> {
  const image = await loadImage(imageDataUrl);
  const x0 = Math.max(0, (box.xPct / 100) * image.naturalWidth - cropPadding);
  const y0 = Math.max(0, (box.yPct / 100) * image.naturalHeight - cropPadding);
  const x1 = Math.min(image.naturalWidth, ((box.xPct + box.widthPct) / 100) * image.naturalWidth + cropPadding);
  const y1 = Math.min(image.naturalHeight, ((box.yPct + box.heightPct) / 100) * image.naturalHeight + cropPadding);
  const width = x1 - x0;
  const height = y1 - y0;

  let scale = Math.min(maxCropScale, Math.max(1, targetCropHeight / height));
  scale = Math.min(scale, Math.sqrt(maxCropPixels / (width * height)));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not supported in this browser.");
  context.imageSmoothingQuality = "high";
  context.drawImage(image, x0, y0, width, height, 0, 0, canvas.width, canvas.height);
  const crop = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not crop word."))), "image/png"),
  );

  const body = new FormData();
  body.append("image", crop, "word.png");
  const response = await fetch(`${qariOcrUrl}/ocr`, { method: "POST", body }).catch(() => {
    throw new Error("Can't reach the QARI-OCR server right now. Switch OCR to Free, or try again later.");
  });

  if (response.status === 429) throw new Error("You've read a lot of words quickly — wait a minute and try again.");
  if (response.status === 503) throw new Error("QARI is busy reading words for other people — try again in a moment.");
  if (!response.ok) throw new Error(`QARI-OCR server returned ${response.status}`);

  const { text } = (await response.json()) as { text: string };
  return text.trim();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the page image."));
    image.src = src;
  });
}
