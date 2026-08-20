import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const getUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return getUrl().length > 0 && KEY().length > 0;
}

let cached: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
  if (!cached) cached = createBrowserClient(getUrl(), KEY());
  return cached;
}
