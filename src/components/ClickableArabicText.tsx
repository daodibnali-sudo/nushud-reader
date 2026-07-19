import { useRef } from "react";
import type { DocumentLine, ReaderWordEntry, WordToken } from "../types";

type ClickableArabicTextProps = {
  lines: DocumentLine[];
  resolvedWords: Record<string, ReaderWordEntry>;
  selectedTokenId: string | null;
  onSelectToken: (token: WordToken) => void;
  onSelectPhrase: (text: string) => void;
};

export function ClickableArabicText({
  lines,
  resolvedWords,
  selectedTokenId,
  onSelectToken,
  onSelectPhrase,
}: ClickableArabicTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelectionEnd = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const text = selection.toString().trim();
    if (!text || !/\s/.test(text)) return; // single word selections stay as plain word clicks

    const anchorNode = selection.anchorNode;
    if (!containerRef.current || !anchorNode || !containerRef.current.contains(anchorNode)) return;

    onSelectPhrase(text);
  };

  return (
    <div
      ref={containerRef}
      className="reader-box arabic"
      dir="rtl"
      lang="ar"
      onMouseUp={handleSelectionEnd}
      onTouchEnd={handleSelectionEnd}
    >
      {lines.map((line) => {
        if (line.tokens.length === 0) {
          return <br key={line.lineIndex} />;
        }

        return (
          <p key={line.lineIndex} className="arabic-line">
            {line.tokens.map((token, index) => {
              const spacer = index > 0 ? " " : "";

              if (!token.normalized) {
                return (
                  <span key={token.id} className="arabic-token-plain">
                    {spacer}
                    {token.raw}
                  </span>
                );
              }

              const isResolved = Boolean(resolvedWords[token.normalized]);
              const isSelected = token.id === selectedTokenId;
              const className = ["arabic-token", isResolved ? "is-known" : "", isSelected ? "is-selected" : ""]
                .filter(Boolean)
                .join(" ");

              return (
                <span key={token.id}>
                  {spacer}
                  <a href="#word" className={className} onClick={(event) => { event.preventDefault(); onSelectToken(token); }}>
                    {token.raw}
                  </a>
                </span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}
