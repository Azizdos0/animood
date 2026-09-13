import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

// SERVER-ONLY — never imported by client code. Uses the service-role key,
// which bypasses Row Level Security.

const getUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const getServiceKey = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function isServiceConfigured(): boolean {
  return getUrl().length > 0 && getServiceKey().length > 0;
}

let cached: SupabaseClient | null = null;

export function supabaseService(): SupabaseClient {
  if (!isServiceConfigured()) throw new Error("Supabase service role is not configured");
  if (!cached) {
    cached = createClient(getUrl(), getServiceKey(), { auth: { persistSession: false } });
  }
  return cached;
}
