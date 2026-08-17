import type { TranscribedWord, TranscriptionResult } from "../types";

type ElevenLabsWord = {
  text: string;
  type: "word" | "spacing" | "audio_event";
  start: number;
  end: number;
};

type ElevenLabsResponse = {
  text: string;
  words: ElevenLabsWord[];
};

/**
 * Paid speech-to-text, opt-in only: the visitor supplies their own ElevenLabs API key
 * (stored in their own browser, see elevenLabsSettings.ts) and this calls ElevenLabs
 * directly from the browser on their key/account/bill - nothing is proxied through or
 * paid for by this app. Used instead of the free in-browser Whisper transcription
 * (transcribeAudio.ts) when someone wants noticeably better accuracy and doesn't mind
 * paying ElevenLabs for it. Word-level timestamps come back natively in the response
 * (no DTW-over-attention-weights step like Whisper needs).
 */
export async function transcribeWithElevenLabs(file: File, apiKey: string): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("model_id", "scribe_v2");
  formData.append("language_code", "ar");
  formData.append("timestamps_granularity", "word");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = (body as { detail?: { message?: string } | string } | null)?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    throw new Error(message || `ElevenLabs request failed (${response.status}).`);
  }

  const data = (await response.json()) as ElevenLabsResponse;

  const words: TranscribedWord[] = (data.words ?? [])
    .filter((word) => word.type === "word")
    .map((word) => ({ text: word.text.trim(), start: word.start, end: word.end }))
    .filter((word) => word.text.length > 0);

  if (words.length === 0) {
    throw new Error("No speech could be recognized in this audio.");
  }

  return { fullText: data.text ?? "", words };
}
