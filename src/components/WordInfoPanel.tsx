import { useState } from "react";
import type { ReaderWordEntry } from "../types";
import { languageLabel } from "../utils/languages";
import { isCardSaved, removeCard, saveCard } from "../repositories/savedCardsRepository";

type WordInfoPanelProps = {
  normalizedWord: string | null;
  word: string | null;
  entry: ReaderWordEntry | null;
  language: string;
  isLoading: boolean;
  /** QARI is reading this word from the page image (click-to-read). */
  isReading?: boolean;
  onSaved?: () => void;
};

export function WordInfoPanel({ normalizedWord, word, entry, language, isLoading, isReading, onSaved }: WordInfoPanelProps) {
  const [, forceRerender] = useState(0);

  if (isReading) {
    return (
      <fieldset>
        <legend>Word info</legend>
        <p className="small">Reading this word with QARI...</p>
      </fieldset>
    );
  }

  if (!word || !normalizedWord) {
    return (
      <fieldset>
        <legend>Word info</legend>
        <p className="small">Click any Arabic word to see its meaning.</p>
      </fieldset>
    );
  }

  const saved = isCardSaved(normalizedWord);

  const toggleSaved = () => {
    if (!entry) return;
    if (saved) {
      removeCard(normalizedWord);
    } else {
      saveCard({
        normalizedWord,
        word,
        language,
        entry,
        savedAt: new Date().toISOString(),
      });
      onSaved?.();
    }
    forceRerender((count) => count + 1);
  };

  const meanings = entry?.meaningsByLanguage[language] ?? [];

  return (
    <fieldset>
      <legend>
        <span className="arabic" dir="rtl" lang="ar">
          {normalizedWord}
        </span>{" "}
        — {languageLabel(language)}
      </legend>

      {word !== normalizedWord && (
        <p className="arabic word-with-harakat" dir="rtl" lang="ar">
          {word}
        </p>
      )}

      {!entry ? (
        <p className="small">{isLoading ? "Translating..." : "Not translated yet."}</p>
      ) : (
        <>
          {meanings.length > 0 ? (
            <ul>
              {meanings.map((meaning) => (
                <li key={meaning}>{meaning}</li>
              ))}
            </ul>
          ) : (
            <p className="small">No translation found.</p>
          )}
          <p className="button-row">
            <button type="button" onClick={toggleSaved}>
              {saved ? "Remove card" : "Save card"}
            </button>
          </p>
        </>
      )}
    </fieldset>
  );
}
