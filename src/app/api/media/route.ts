import { getMediaByIds } from "@/lib/anilist/media";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) return Response.json({ items: [] });

  try {
    const items = await getMediaByIds(ids);
    return Response.json({ items });
  } catch {
    return Response.json({ items: [], error: "fetch_failed" }, { status: 502 });
  }
}
