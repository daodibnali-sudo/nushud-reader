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

export type ExtractionResult = {
  fileName: string;
  fullText: string;
  pages: ExtractionPageResult[];
  usedOcrPageCount: number;
};
