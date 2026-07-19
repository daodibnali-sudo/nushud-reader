import type { ReaderWordEntry } from "../types";

export type SavedCard = {
  normalizedWord: string;
  word: string;
  language: string;
  entry: ReaderWordEntry;
  savedAt: string;
};

const storageKey = "nushudReaderSavedCards";

export function getSavedCards(): SavedCard[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedCard[]) : [];
  } catch {
    return [];
  }
}

export function isCardSaved(normalizedWord: string): boolean {
  return getSavedCards().some((card) => card.normalizedWord === normalizedWord);
}

export function saveCard(card: SavedCard): SavedCard[] {
  const current = getSavedCards().filter((existing) => existing.normalizedWord !== card.normalizedWord);
  const next = [...current, card];
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}

export function removeCard(normalizedWord: string): SavedCard[] {
  const next = getSavedCards().filter((card) => card.normalizedWord !== normalizedWord);
  localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
}
