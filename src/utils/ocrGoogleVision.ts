import type { OcrResult, OcrWordBox } from "../types";

type Vertex = { x?: number; y?: number };
type VisionWord = { boundingBox?: { vertices?: Vertex[] }; symbols?: { text: string }[] };
type VisionPage = {
  width: number;
  height: number;
  blocks?: { paragraphs?: { words?: VisionWord[] }[] }[];
};

/**
 * Paid OCR, opt-in only: the visitor supplies their own Google Cloud Vision API key
 * (stored in their own browser, see ocrSettings.ts) and this calls Cloud Vision directly
 * from the browser on their key/account/bill - nothing is proxied through or paid for by
 * this app. Same "bring your own key" shape as transcribeElevenLabs.ts. Verified live
 * (not just from docs) that vision.googleapis.com accepts a plain ?key= API key and sends
 * CORS headers allowing a direct browser fetch - Google's own docs only show
 * OAuth/server-side examples, which would have made this impossible.
 */
export async function recognizeWithGoogleVision(dataUrl: string, apiKey: string): Promise<OcrResult> {
  const base64Content = dataUrl.split(",")[1] ?? dataUrl;

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64Content },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          imageContext: { languageHints: ["ar"] },
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message || `Google Vision request failed (${response.status}).`);
  }

  const result = data?.responses?.[0];
  const text: string | undefined = result?.fullTextAnnotation?.text;

  if (!text) {
    throw new Error(result?.error?.message || "No text could be recognized in this image.");
  }

  const words: OcrWordBox[] = [];
  const pages: VisionPage[] = result?.fullTextAnnotation?.pages ?? [];

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const vertices = word.boundingBox?.vertices ?? [];
          if (vertices.length === 0) continue;

          const xs = vertices.map((vertex) => vertex.x ?? 0);
          const ys = vertices.map((vertex) => vertex.y ?? 0);
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs);
          const y0 = Math.min(...ys);
          const y1 = Math.max(...ys);
          const wordText = (word.symbols ?? []).map((symbol) => symbol.text).join("");

          if (!wordText) continue;

          words.push({
            text: wordText,
            xPct: (x0 / page.width) * 100,
            yPct: (y0 / page.height) * 100,
            widthPct: ((x1 - x0) / page.width) * 100,
            heightPct: ((y1 - y0) / page.height) * 100,
          });
        }
      }
    }
  }

  return { text, words };
}
