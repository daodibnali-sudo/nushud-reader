import type { DocumentLine, ReaderWordEntry, WordToken } from "../types";

type ClickableArabicTextProps = {
  lines: DocumentLine[];
  resolvedWords: Record<string, ReaderWordEntry>;
  selectedTokenId: string | null;
  onSelectToken: (token: WordToken) => void;
};

export function ClickableArabicText({ lines, resolvedWords, selectedTokenId, onSelectToken }: ClickableArabicTextProps) {
  return (
    <div className="reader-box arabic" dir="rtl" lang="ar">
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
