/**
 * Paid OCR, opt-in only: the visitor supplies their own Google Cloud Vision API key
 * (stored in their own browser, see ocrSettings.ts) and this calls Cloud Vision directly
 * from the browser on their key/account/bill - nothing is proxied through or paid for by
 * this app. Same "bring your own key" shape as transcribeElevenLabs.ts. Verified live
 * (not just from docs) that vision.googleapis.com accepts a plain ?key= API key and sends
 * CORS headers allowing a direct browser fetch - Google's own docs only show
 * OAuth/server-side examples, which would have made this impossible.
 */
export async function recognizeWithGoogleVision(dataUrl: string, apiKey: string): Promise<string> {
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
  const text = result?.fullTextAnnotation?.text;

  if (!text) {
    throw new Error(result?.error?.message || "No text could be recognized in this image.");
  }

  return text;
}
