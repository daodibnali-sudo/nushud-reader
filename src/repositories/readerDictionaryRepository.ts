import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReaderDictionary } from "../types";

const bucket = "reader-dictionary";
const path = "words.json";

/**
 * This app's own word cache: read from and written back to a bucket separate
 * from NUSHUD's shared dictionary/words.json, so arbitrary uploaded documents
 * never dirty the curated mobile-app dictionary.
 */
export async function downloadReaderDictionary(supabase: SupabaseClient): Promise<ReaderDictionary> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error) {
    return {};
  }

  try {
    const parsed = JSON.parse(await data.text());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ReaderDictionary) : {};
  } catch {
    throw new Error(`${bucket}/${path} exists but is not valid JSON.`);
  }
}

export async function uploadReaderDictionary(supabase: SupabaseClient, dictionary: ReaderDictionary): Promise<void> {
  const file = new File([JSON.stringify(dictionary, null, 2)], path, { type: "application/json" });
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    contentType: "application/json",
    upsert: true,
  });

  if (error) {
    throw new Error(`Could not save ${bucket}/${path}: ${error.message}`);
  }
}
