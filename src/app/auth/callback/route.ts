import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { supabaseServer } from "@/lib/supabase/server";
import { AUTH_NEXT_COOKIE, safeNextPath } from "@/lib/auth/redirect";

function withAuthError(path: string, origin: string): URL {
  const target = new URL(path, origin);
  target.searchParams.set("authError", "1");
  return target;
}

function redirect(target: URL): NextResponse {
  const response = NextResponse.redirect(target);
  response.cookies.delete(AUTH_NEXT_COOKIE);
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const next = safeNextPath(request.cookies.get(AUTH_NEXT_COOKIE)?.value);
  const code = url.searchParams.get("code");

  // Google or Supabase reported a failure (e.g. the user cancelled consent).
  if (url.searchParams.get("error")) {
    console.error("auth callback: provider error", url.searchParams.get("error_description") ?? url.searchParams.get("error"));
    return redirect(withAuthError(next, url.origin));
  }

  if (code && isSupabaseConfigured()) {
    const supabase = await supabaseServer();
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        console.error("auth callback: exchangeCodeForSession failed", error);
        return redirect(withAuthError(next, url.origin));
      }
    } catch (err) {
      console.error("auth callback: exchangeCodeForSession threw", err);
      return redirect(withAuthError(next, url.origin));
    }
  }
  return redirect(new URL(next, url.origin));
}
