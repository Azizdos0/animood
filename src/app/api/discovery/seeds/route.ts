import { searchMedia } from "@/lib/anilist/media";

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const type = params.get("type") ?? "ANIME";
  const search = (params.get("q") ?? "").trim();
  if ((type !== "ANIME" && type !== "MANGA") || search.length > 150) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  try {
    const { items } = await searchMedia({ type, search, sort: "POPULARITY_DESC", perPage: 12 });
    return Response.json({ items: items.map(({ id, title, coverImage }) => ({ id, title, coverImage })) });
  } catch {
    return Response.json({ error: "fetch_failed" }, { status: 502 });
  }
}
