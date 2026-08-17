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
 * Model is Xenova/whisper-base specifically, not onnx-community/whisper-base — the
 * onnx-community export's decoder graph doesn't output cross-attentions at all
 * ("Model outputs must contain cross attentions to extract timestamps... not exported
 * with output_attentions=True"), which word-level timestamps need for the DTW
 * time-alignment step. Xenova/whisper-base is the original, more complete conversion
 * (it's what Hugging Face's own official word-timestamps demo is built on).
 *
 * dtype is forced to fp32: Xenova/whisper-base's default (quantized) decoder has the
 * *same* missing-scale-tensor bug onnx-community's quantized export had
 * (TransposeDQWeightsForMatMulNBits fails on model.decoder.embed_tokens.weight_merged_0_scale)
 * — this turned out to be a quantized-ONNX-export problem in general, not specific to
 * one repo. fp32 avoids that broken matmul path in both.
 */
async function getTranscriber(onProgress: (message: string) => void): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    onProgress("Downloading speech-recognition model (first time only, ~150MB)...");
    transcriberPromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "fp32" }),
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
