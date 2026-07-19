import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * No login in this app — it's free and open to anyone. The anon key is meant to be
 * public (see NUSHUD's SUPABASE_SETUP.md: "never put service-role keys" here, anon
 * keys are fine client-side), baked in at build time via .env.
 */
export function getSupabaseClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.",
    );
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
