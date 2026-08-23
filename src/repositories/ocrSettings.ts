export type OcrEngine = "free" | "google-vision";

const engineStorageKey = "nushudReaderOcrEngine";
const apiKeyStorageKey = "nushudReaderGoogleVisionKey";

export function getOcrEngine(): OcrEngine {
  return localStorage.getItem(engineStorageKey) === "google-vision" ? "google-vision" : "free";
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
