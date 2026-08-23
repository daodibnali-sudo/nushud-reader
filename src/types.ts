export type SupabaseConfig = {
  url: string;
  anonKey: string;
};

/**
 * Matches nushudtools/NUSHUD's shared dictionary/words.json entry shape.
 * This app only reads `meaning` from it (as a free English-only shortcut) — the
 * morphology fields (root, wazn, etc.) exist in NUSHUD's schema but this app
 * doesn't use or show them.
 */
export type DictionaryEntry = {
  word: string;
  meaning: string[];
};

export type SharedDictionary = Record<string, DictionaryEntry>;

/** This app's own store: the word (harakat stripped) plus 1-4 meanings per target language. */
export type ReaderWordEntry = {
  word: string;
  meaningsByLanguage: Record<string, string[]>;
  updatedAt: string;
};

export type ReaderDictionary = Record<string, ReaderWordEntry>;

export type WordToken = {
  id: string;
  raw: string;
  normalized: string;
  lineIndex: number;
  tokenIndex: number;
  /** Seconds into the source audio — only set for a transcribed-audio document, used to highlight the word being spoken during playback. */
  start?: number;
  end?: number;
};

export type DocumentLine = {
  lineIndex: number;
  tokens: WordToken[];
};

export type WordLookupStatus = "idle" | "queued" | "loading" | "resolved" | "error";

export type ExtractionSourceKind = "text-layer" | "ocr";

export type ExtractionPageResult = {
  pageIndex: number;
  text: string;
  source: ExtractionSourceKind;
};

/** A single OCR'd word's position on its source page image, as a percentage of the
 * image's width/height so the overlay stays aligned regardless of display size. */
export type OcrWordBox = {
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type OcrResult = {
  text: string;
  words: OcrWordBox[];
};

/** One OCR'd page: the rendered/uploaded page image plus every word's position on it,
 * used to render a tappable text layer directly over the original scan. */
export type OcrPageResult = {
  imageDataUrl: string;
  words: OcrWordBox[];
};

export type ExtractionResult = {
  fileName: string;
  fullText: string;
  pages: ExtractionPageResult[];
  usedOcrPageCount: number;
  /** Empty unless OCR ran - text-layer PDFs, .txt, and .docx have no page image to overlay. */
  ocrPages: OcrPageResult[];
};

export type TranscribedWord = {
  text: string;
  start: number;
  end: number;
};

export type TranscriptionResult = {
  fullText: string;
  words: TranscribedWord[];
};
