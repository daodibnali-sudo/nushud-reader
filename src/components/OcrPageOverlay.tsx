import type { ReaderWordEntry, WordToken } from "../types";
import type { OcrOverlayWord } from "../utils/arabicText";

type OcrPageOverlayProps = {
  imageDataUrl: string;
  words: OcrOverlayWord[];
  resolvedWords: Record<string, ReaderWordEntry>;
  selectedTokenId: string | null;
  onSelectToken: (token: WordToken) => void;
};

/**
 * Renders one OCR'd page as its original scanned image with a tappable text layer
 * positioned directly on top, word-for-word - like Adobe/Google's OCR overlay - instead
 * of ClickableArabicText's reflowed paragraph. Word boxes are percentage-of-image units
 * (see OcrWordBox), so positioning stays aligned at any display size with pure CSS, no
 * resize listeners needed.
 */
export function OcrPageOverlay({ imageDataUrl, words, resolvedWords, selectedTokenId, onSelectToken }: OcrPageOverlayProps) {
  return (
    <div className="ocr-page">
      <img src={imageDataUrl} alt="" className="ocr-page-image" />
      {words.map((word) => {
        if (!word.normalized) return null;

        const isResolved = Boolean(resolvedWords[word.normalized]);
        const isSelected = word.id === selectedTokenId;
        const className = ["ocr-word", isResolved ? "is-known" : "", isSelected ? "is-selected" : ""]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            key={word.id}
            href="#word"
            className={className}
            style={{
              left: `${word.xPct}%`,
              top: `${word.yPct}%`,
              width: `${word.widthPct}%`,
              height: `${word.heightPct}%`,
            }}
            title={word.raw}
            onClick={(event) => {
              event.preventDefault();
              onSelectToken(word);
            }}
          />
        );
      })}
    </div>
  );
}
