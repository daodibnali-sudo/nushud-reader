import type { AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

export type TranscribedWord = {
  text: string;
  start: number;
  end: number;
};

export type TranscriptionResult = {
  fullText: string;
  words: TranscribedWord[];
};

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

/**
 * Free, client-side speech-to-text via transformers.js (Whisper, running as WASM/WebGPU
 * in the browser — no API, no backend, same "runs on the visitor's device" shape as
 * Tesseract.js for OCR). transformers.js itself is dynamically imported (not a top-level
 * import) so its JS — and the much larger ONNX runtime it pulls in — is only ever fetched
 * by someone who actually uploads audio, not on every page load. The transcriber is then
 * reused across uploads in a session so the model is only downloaded once. "whisper-base"
 * is a size/quality compromise for Arabic; a heavier model (e.g. whisper-small) would
 * transcribe more accurately at the cost of a much bigger first-run download.
 *
 * dtype is fp32 (not q8/q4) on purpose: onnx-community's quantized decoder export for
 * this model is missing a required scale tensor for its embedding layer
 * (TransposeDQWeightsForMatMulNBits fails with "Missing required scale:
 * model.decoder.embed_tokens.weight_merged_0_scale"), so onnxruntime-web can't even
 * build a session with it. fp32 uses the standard matmul path instead of that broken
 * quantized one — bigger download, but it actually works.
 */
async function getTranscriber(onProgress: (message: string) => void): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    onProgress("Downloading speech-recognition model (first time only, ~150MB)...");
    transcriberPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("automatic-speech-recognition", "onnx-community/whisper-base", { dtype: "fp32" }),
    );
  }
  return transcriberPromise;
}

export async function transcribeArabicAudio(
  file: File,
  onProgress: (message: string) => void,
): Promise<TranscriptionResult> {
  const transcriber = await getTranscriber(onProgress);
  onProgress("Transcribing audio (this can take a while for longer recordings)...");

  const audioUrl = URL.createObjectURL(file);
  try {
    const output = await transcriber(audioUrl, {
      language: "arabic",
      task: "transcribe",
      return_timestamps: "word",
      chunk_length_s: 30,
      stride_length_s: 5,
    });

    const result = Array.isArray(output) ? output[0] : output;
    const chunks = (result.chunks ?? []) as { text: string; timestamp: [number, number | null] }[];

    const words: TranscribedWord[] = chunks
      .map((chunk) => {
        const start = chunk.timestamp[0] ?? 0;
        return { text: chunk.text.trim(), start, end: chunk.timestamp[1] ?? start };
      })
      .filter((word) => word.text.length > 0);

    if (words.length === 0) {
      throw new Error("No speech could be recognized in this audio.");
    }

    return { fullText: result.text ?? "", words };
  } finally {
    URL.revokeObjectURL(audioUrl);
  }
}
