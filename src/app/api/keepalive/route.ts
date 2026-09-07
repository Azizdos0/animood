// Keeps the free-tier Supabase project from auto-pausing: a scheduled Vercel Cron
// (see vercel.json) hits this daily, which performs a tiny DB read counting as
// activity. Always returns 200 so the cron never alarms; degrades gracefully when
// Supabase is unconfigured or unreachable.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ts = new Date().toISOString();

  if (!url || !key) {
    return Response.json({ ok: false, reason: "unconfigured", ts });
  }

  try {
    const res = await fetch(`${url}/rest/v1/profiles?select=user_id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    return Response.json({ ok: res.ok, status: res.status, ts });
  } catch {
    return Response.json({ ok: false, reason: "unreachable", ts });
  }
}
