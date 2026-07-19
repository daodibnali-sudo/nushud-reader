/**
 * Free, client-side word translation — no API key, no backend call, no cost.
 * Uses Google Translate's public unofficial endpoint (the same one many free
 * translation widgets use directly from the browser). `dt=bd` asks for the
 * "bilingual dictionary" data, which is what gives us multiple alternative
 * meanings for a single word instead of just one sentence-style translation.
 *
 * This is unofficial and could break or get rate-limited if hammered — if that
 * happens in practice, the fix is to move this same call behind a small Supabase
 * Edge Function instead, not to switch to a paid API.
 */

const endpoint = "https://translate.googleapis.com/translate_a/single";
const maxMeanings = 4;

/**
 * Translates an arbitrary selected phrase/sentence (not a single dictionary word).
 * Uses the same endpoint but skips the bilingual-dictionary lookup (`dt=bd`),
 * since that's meant for single words — a full sentence just wants the plain
 * sentence-style translation (`dt=t`).
 */
export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "";

  if (targetLanguage === "ar") {
    return trimmed;
  }

  const url = `${endpoint}?client=gtx&sl=ar&tl=${encodeURIComponent(targetLanguage)}&dt=t&q=${encodeURIComponent(trimmed)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Translation request failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseSentence(data) || trimmed;
}

function parseSentence(data: unknown): string {
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0]
      .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
      .join("")
      .trim();
  }
  return "";
}

export async function translateWord(word: string, targetLanguage: string): Promise<string[]> {
  if (!word) return [];

  if (targetLanguage === "ar") {
    return [word];
  }

  const url = `${endpoint}?client=gtx&sl=ar&tl=${encodeURIComponent(targetLanguage)}&dt=t&dt=bd&q=${encodeURIComponent(word)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Translation request failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  return parseMeanings(data, word);
}

function parseMeanings(data: unknown, fallback: string): string[] {
  const meanings: string[] = [];

  if (Array.isArray(data)) {
    const sentenceParts = data[0];
    if (Array.isArray(sentenceParts)) {
      const primary = sentenceParts
        .map((part) => (Array.isArray(part) && typeof part[0] === "string" ? part[0] : ""))
        .join("")
        .trim();
      if (primary) meanings.push(primary);
    }

    const dictionary = data[1];
    if (Array.isArray(dictionary)) {
      dictionary.forEach((entry) => {
        if (!Array.isArray(entry)) return;
        const alternatives = entry[1];
        if (!Array.isArray(alternatives)) return;

        alternatives.forEach((alt) => {
          if (typeof alt === "string" && alt.trim() && !meanings.includes(alt.trim())) {
            meanings.push(alt.trim());
          }
        });
      });
    }
  }

  return meanings.length > 0 ? meanings.slice(0, maxMeanings) : [fallback];
}
