import type { DocumentLine, OcrPageResult, TranscribedWord, WordToken } from "../types";

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

const sentenceEndRegex = /[.؟!۔:]$/;
const maxWordsPerTranscribedLine = 12;

/**
 * Whisper's word-level chunks arrive as one flat timeline with no line breaks, so lines
 * are synthesized here — break on Arabic/Latin sentence-ending punctuation, or after
 * maxWordsPerTranscribedLine words, whichever comes first, purely so the reader doesn't
 * render one giant unbroken paragraph. start/end (seconds) are carried onto each token
 * so playback can highlight the word currently being spoken.
 */
export function buildDocumentLinesFromTranscribedWords(words: TranscribedWord[]): DocumentLine[] {
  const lines: DocumentLine[] = [];
  let currentTokens: WordToken[] = [];
  let lineIndex = 0;
  let tokenId = 0;

  words.forEach((word, index) => {
    tokenId += 1;
    currentTokens.push({
      id: `a${tokenId}`,
      raw: word.text,
      normalized: normalizeArabicWord(word.text),
      lineIndex,
      tokenIndex: currentTokens.length,
      start: word.start,
      end: word.end,
    });

    const isLastWord = index === words.length - 1;
    if (isLastWord || sentenceEndRegex.test(word.text) || currentTokens.length >= maxWordsPerTranscribedLine) {
      lines.push({ lineIndex, tokens: currentTokens });
      lineIndex += 1;
      currentTokens = [];
    }
  });

  return lines;
}

export type OcrOverlayWord = WordToken & {
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
};

export type OcrOverlayPage = {
  imageDataUrl: string;
  words: OcrOverlayWord[];
};

/**
 * Builds both halves an OCR'd, page-image-overlay document needs from the same word
 * boxes: DocumentLine[] (one per page) so the existing translation pipeline works
 * unchanged, and OcrOverlayPage[] (word position carried alongside each WordToken) for
 * rendering the tappable text layer directly on top of the original scan. Both sides
 * share the same token ids/normalized text, so resolvedWords lookups line up.
 */
export function buildDocumentFromOcrPages(ocrPages: OcrPageResult[]): {
  lines: DocumentLine[];
  overlayPages: OcrOverlayPage[];
} {
  let tokenId = 0;
  const lines: DocumentLine[] = [];
  const overlayPages: OcrOverlayPage[] = [];

  ocrPages.forEach((page, pageIndex) => {
    const tokens: WordToken[] = [];
    const overlayWords: OcrOverlayWord[] = [];

    page.words.forEach((word, tokenIndex) => {
      tokenId += 1;
      const token: WordToken = {
        id: `o${tokenId}`,
        raw: word.text,
        normalized: normalizeArabicWord(word.text),
        lineIndex: pageIndex,
        tokenIndex,
      };
      tokens.push(token);
      overlayWords.push({
        ...token,
        xPct: word.xPct,
        yPct: word.yPct,
        widthPct: word.widthPct,
        heightPct: word.heightPct,
      });
    });

    lines.push({ lineIndex: pageIndex, tokens });
    overlayPages.push({ imageDataUrl: page.imageDataUrl, words: overlayWords });
  });

  return { lines, overlayPages };
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
