/** "qari-click": our word finder boxes every word instantly; QARI-OCR (the laptop server) reads each word when it's clicked. */
export type OcrEngine = "free" | "google-vision" | "qari-click";

const engineStorageKey = "nushudReaderOcrEngine";
const apiKeyStorageKey = "nushudReaderGoogleVisionKey";

/** The engine the visitor picked, or null if they never chose (so QARI can become the default when available). */
export function getStoredOcrEngine(): OcrEngine | null {
  const stored = localStorage.getItem(engineStorageKey);
  return stored === "google-vision" || stored === "qari-click" || stored === "free" ? stored : null;
}

export function getOcrEngine(): OcrEngine {
  const stored = getStoredOcrEngine();
  // "qari-click" is only offered while the QARI server is reachable; App falls back if it isn't.
  return stored ?? "free";
}

export function setOcrEngine(engine: OcrEngine): void {
  localStorage.setItem(engineStorageKey, engine);
}

export function getGoogleVisionApiKey(): string {
  return localStorage.getItem(apiKeyStorageKey) ?? "";
}

export function setGoogleVisionApiKey(apiKey: string): void {
  if (apiKey) {
    localStorage.setItem(apiKeyStorageKey, apiKey);
  } else {
    localStorage.removeItem(apiKeyStorageKey);
  }
}
