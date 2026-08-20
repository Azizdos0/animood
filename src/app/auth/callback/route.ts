import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code && isSupabaseConfigured()) {
    const supabase = await supabaseServer();
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("auth callback: exchangeCodeForSession failed", error);
        return NextResponse.redirect(new URL("/?authError=1", url.origin));
      }
    } catch (err) {
      console.error("auth callback: exchangeCodeForSession threw", err);
      return NextResponse.redirect(new URL("/?authError=1", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/", url.origin));
}
