export type TranscriptionEngine = "free" | "elevenlabs";

const engineStorageKey = "nushudReaderTranscriptionEngine";
const apiKeyStorageKey = "nushudReaderElevenLabsKey";

export function getTranscriptionEngine(): TranscriptionEngine {
  return localStorage.getItem(engineStorageKey) === "elevenlabs" ? "elevenlabs" : "free";
}

export function setTranscriptionEngine(engine: TranscriptionEngine): void {
  localStorage.setItem(engineStorageKey, engine);
}

export function getElevenLabsApiKey(): string {
  return localStorage.getItem(apiKeyStorageKey) ?? "";
}

export function setElevenLabsApiKey(apiKey: string): void {
  if (apiKey) {
    localStorage.setItem(apiKeyStorageKey, apiKey);
  } else {
    localStorage.removeItem(apiKeyStorageKey);
  }
}
