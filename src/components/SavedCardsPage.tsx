import { useState } from "react";
import { getSavedCards, removeCard, type SavedCard } from "../repositories/savedCardsRepository";
import { languageLabel } from "../utils/languages";

export function SavedCardsPage() {
  const [cards, setCards] = useState(() => getSavedCards());

  const handleRemove = (normalizedWord: string) => {
    setCards(removeCard(normalizedWord));
  };

  if (cards.length === 0) {
    return (
      <fieldset>
        <legend>My Cards</legend>
        <p className="small">No saved words yet. Click a word while reading, then "Save card".</p>
      </fieldset>
    );
  }

  const ordered = cards.slice().reverse();
  const rows: SavedCard[][] = [];
  for (let i = 0; i < ordered.length; i += 2) {
    rows.push(ordered.slice(i, i + 2));
  }

  return (
    <fieldset>
      <legend>My Cards ({cards.length})</legend>
      <table className="cards-grid">
        <tbody>
          {rows.map((pair) => (
            <tr key={pair[0].normalizedWord}>
              {pair.map((card) => (
                <td key={`${card.normalizedWord}-${card.language}`} className="card-block">
                  <button
                    type="button"
                    className="card-delete"
                    onClick={() => handleRemove(card.normalizedWord)}
                    aria-label="Remove card"
                    title="Remove"
                  >
                    ×
                  </button>
                  <div className="card-word arabic" dir="rtl" lang="ar">
                    {card.normalizedWord}
                  </div>
                  <div className="card-meaning">{card.entry.meaningsByLanguage[card.language]?.join(", ") || "—"}</div>
                  <div className="card-lang">{languageLabel(card.language)}</div>
                </td>
              ))}
              {pair.length === 1 && <td className="card-block card-block-empty" />}
            </tr>
          ))}
        </tbody>
      </table>
    </fieldset>
  );
}
