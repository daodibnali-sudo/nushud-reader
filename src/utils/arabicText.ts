import type { DocumentLine, WordToken } from "../types";

// Written with explicit \u escapes (not literal glyphs) so the range order can't get
// silently scrambled by an editor/tool round-trip — that exact bug once made every
// Arabic word normalize to an empty string, which made nothing clickable.
const arabicDiacriticsRegex = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const tatweelRegex = /ـ/g;
const punctuationRegex = /[^\p{Script=Arabic}\p{Letter}\p{Number}]+/gu;
const arabicLetterRegex = /[؀-ۿ]/g;

/**
 * Same normalization NUSHUD and nushudtools use for dictionary keys.
 * Must stay identical so lookups against the shared dictionary/words.json hit.
 */
export function normalizeArabicWord(text: string): string {
  return text
    .normalize("NFKD")
    .replace(arabicDiacriticsRegex, "")
    .replace(tatweelRegex, "")
    .replace(/[إأٱآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(punctuationRegex, "")
    .trim();
}

export function splitIntoLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function tokenizeLine(line: string): string[] {
  return line
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Ratio of Arabic letters among non-whitespace characters, used to decide if a PDF page needs OCR. */
export function arabicDensity(text: string): number {
  const nonSpace = text.replace(/\s+/g, "");
  if (nonSpace.length === 0) return 0;
  const arabicChars = nonSpace.match(arabicLetterRegex);
  return (arabicChars?.length ?? 0) / nonSpace.length;
}

export function buildDocumentLines(fullText: string): DocumentLine[] {
  const lines = splitIntoLines(fullText);
  let tokenId = 0;

  return lines.map((line, lineIndex): DocumentLine => {
    const tokens: WordToken[] = tokenizeLine(line).map((raw, tokenIndex): WordToken => {
      tokenId += 1;
      return {
        id: `t${tokenId}`,
        raw,
        normalized: normalizeArabicWord(raw),
        lineIndex,
        tokenIndex,
      };
    });

    return { lineIndex, tokens };
  });
}

export function uniqueNormalizedWords(lines: DocumentLine[]): string[] {
  const seen = new Set<string>();
  const words: string[] = [];

  lines.forEach((line) => {
    line.tokens.forEach((token) => {
      if (!token.normalized || seen.has(token.normalized)) return;
      seen.add(token.normalized);
      words.push(token.normalized);
    });
  });

  return words;
}
