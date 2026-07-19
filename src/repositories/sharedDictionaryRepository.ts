import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedDictionary } from "../types";

const bucket = "dictionary";
const path = "words.json";

/**
 * Read-only access to NUSHUD's shared dictionary/words.json.
 * This app never writes here — see readerDictionaryRepository for this app's own store.
 *
 * Fetched through the bucket's public URL rather than supabase.storage.download():
 * the `dictionary` bucket's SELECT policy in NUSHUD is admin-only, and this app has
 * no login, so the authenticated download endpoint would be denied. The public URL
 * bypasses storage RLS entirely (that's what "public bucket" means in Supabase).
 */
export async function downloadSharedDictionary(supabase: SupabaseClient): Promise<SharedDictionary> {
  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);

  try {
    const response = await fetch(`${publicUrlData.publicUrl}?cachebust=${Date.now()}`);

    if (!response.ok) {
      return {};
    }

    return normalizeSharedDictionary(await response.json());
  } catch {
    throw new Error(`Could not load ${bucket}/${path}.`);
  }
}

function normalizeSharedDictionary(json: unknown): SharedDictionary {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {};
  }

  const result: SharedDictionary = {};

  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;

    result[key] = {
      word: typeof record.word === "string" ? record.word : key,
      meaning: Array.isArray(record.meaning) ? record.meaning.map((item) => String(item)) : [],
    };
  }

  return result;
}
