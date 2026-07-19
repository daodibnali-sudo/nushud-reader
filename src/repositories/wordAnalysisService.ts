import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentLine, ReaderDictionary, ReaderWordEntry } from "../types";
import { uniqueNormalizedWords } from "../utils/arabicText";
import { downloadSharedDictionary } from "./sharedDictionaryRepository";
import { downloadReaderDictionary, uploadReaderDictionary } from "./readerDictionaryRepository";
import { translateWord } from "../utils/freeTranslate";

const concurrency = 4;
const delayBetweenBatchesMs = 150;

export type AnalysisPhase = "loading-cache" | "analyzing" | "saving" | "done";

export type AnalysisProgress = {
  totalWords: number;
  resolvedWords: number;
  phase: AnalysisPhase;
};

export type AnalysisOutcome = {
  resolved: Record<string, ReaderWordEntry>;
  failedWords: string[];
};

export type AnalysisCallbacks = {
  onProgress: (progress: AnalysisProgress) => void;
  onWordsResolved: (entries: Record<string, ReaderWordEntry>) => void;
};

/**
 * Words are already harakat-free by this point (see normalizeArabicWord in arabicText.ts) —
 * that's the key used for lookup, storage, and translation alike, so the same word never
 * gets analyzed twice just because it appeared with different diacritics.
 */
export async function analyzeDocumentWords(
  supabase: SupabaseClient,
  lines: DocumentLine[],
  language: string,
  { onProgress, onWordsResolved }: AnalysisCallbacks,
): Promise<AnalysisOutcome> {
  const words = uniqueNormalizedWords(lines);

  onProgress({ totalWords: words.length, resolvedWords: 0, phase: "loading-cache" });

  const [sharedDictionary, readerDictionary] = await Promise.all([
    downloadSharedDictionary(supabase),
    downloadReaderDictionary(supabase),
  ]);

  const resolved: Record<string, ReaderWordEntry> = {};
  const needsTranslation: string[] = [];

  words.forEach((normalized) => {
    const readerEntry = readerDictionary[normalized];
    if (readerEntry?.meaningsByLanguage[language]?.length) {
      resolved[normalized] = readerEntry;
      return;
    }

    const sharedEntry = sharedDictionary[normalized];
    if (sharedEntry?.meaning?.length && language === "en") {
      const entry = mergeIntoEntry(readerDictionary[normalized], normalized, "en", sharedEntry.meaning);
      readerDictionary[normalized] = entry;
      resolved[normalized] = entry;
      return;
    }

    needsTranslation.push(normalized);
  });

  let dictionaryChanged = Object.keys(resolved).length > 0;
  onWordsResolved({ ...resolved });
  onProgress({ totalWords: words.length, resolvedWords: Object.keys(resolved).length, phase: "analyzing" });

  const failedWords: string[] = [];

  for (let start = 0; start < needsTranslation.length; start += concurrency) {
    const batch = needsTranslation.slice(start, start + concurrency);
    const batchResolved: Record<string, ReaderWordEntry> = {};

    await Promise.all(
      batch.map(async (normalized) => {
        try {
          const meanings = await translateWord(normalized, language);
          const entry = mergeIntoEntry(readerDictionary[normalized], normalized, language, meanings);
          readerDictionary[normalized] = entry;
          resolved[normalized] = entry;
          batchResolved[normalized] = entry;
          dictionaryChanged = true;
        } catch {
          failedWords.push(normalized);
        }
      }),
    );

    if (Object.keys(batchResolved).length > 0) {
      onWordsResolved(batchResolved);
    }
    onProgress({ totalWords: words.length, resolvedWords: Object.keys(resolved).length, phase: "analyzing" });

    if (start + concurrency < needsTranslation.length) {
      await delay(delayBetweenBatchesMs);
    }
  }

  if (dictionaryChanged) {
    onProgress({ totalWords: words.length, resolvedWords: Object.keys(resolved).length, phase: "saving" });
    await uploadReaderDictionary(supabase, readerDictionary);
  }

  onProgress({ totalWords: words.length, resolvedWords: Object.keys(resolved).length, phase: "done" });

  return { resolved, failedWords };
}

function mergeIntoEntry(
  existing: ReaderWordEntry | undefined,
  word: string,
  language: string,
  meanings: string[],
): ReaderWordEntry {
  return {
    word,
    meaningsByLanguage: {
      ...(existing?.meaningsByLanguage ?? {}),
      [language]: meanings,
    },
    updatedAt: new Date().toISOString(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
