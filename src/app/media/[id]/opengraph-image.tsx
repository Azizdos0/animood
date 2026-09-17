import { ImageResponse } from "next/og";
import { getMediaById } from "@/lib/anilist/media";

// Per-media Open Graph / Twitter share image (1200x630). Next's file-convention
// image overrides the generic site-wide one (and pageMetadata's images) for
// /media/[id], so a shared link to a specific title shows its own art.
export const alt = "Animood";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BG = "#0a0a0d";
const FG = "#f4f2ef";
const PINK = "#f472b6";
const MUTED = "#a1a1aa";

function BrandFallback() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: BG,
          padding: 84,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 132, fontWeight: 900, color: FG, letterSpacing: "-0.05em" }}>ANIMOOD</div>
        <div style={{ display: "flex", fontSize: 48, marginTop: 20 }}>
          <span style={{ color: FG }}>A story for&nbsp;</span>
          <span style={{ color: PINK }}>every mood.</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return BrandFallback();

  let media;
  try {
    media = await getMediaById(id);
  } catch {
    return BrandFallback();
  }
  if (!media) return BrandFallback();

  const score = media.averageScore != null ? `${(media.averageScore / 20).toFixed(1)} / 5` : null;
  const metaBits = [media.format, media.seasonYear ? String(media.seasonYear) : null, score].filter(Boolean) as string[];
  const genres = media.genres.slice(0, 3);

  return new ImageResponse(
    (
      <div style={{ position: "relative", height: "100%", width: "100%", display: "flex", background: BG, fontFamily: "sans-serif" }}>
        {media.bannerImage ? (
          <img src={media.bannerImage} width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
        ) : null}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            background: media.bannerImage
              ? "linear-gradient(90deg, rgba(10,10,13,0.97) 45%, rgba(10,10,13,0.66) 100%)"
              : BG,
          }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 44, width: "100%", height: "100%", padding: 72 }}>
          {media.coverImage ? (
            <img
              src={media.coverImage}
              width={258}
              height={387}
              style={{ width: 258, height: 387, borderRadius: 18, objectFit: "cover", border: "1px solid rgba(255,255,255,0.14)" }}
            />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingBottom: 8 }}>
            <div style={{ display: "flex", fontSize: 24, letterSpacing: "0.28em", color: PINK }}>ANIMOOD</div>
            <div
              style={{
                display: "flex",
                fontSize: media.title.length > 40 ? 52 : 68,
                fontWeight: 900,
                color: FG,
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
                marginTop: 18,
              }}
            >
              {media.title.length > 90 ? media.title.slice(0, 89) + "…" : media.title}
            </div>
            {metaBits.length ? (
              <div style={{ display: "flex", fontSize: 30, color: MUTED, marginTop: 20 }}>{metaBits.join("  ·  ")}</div>
            ) : null}
            {genres.length ? (
              <div style={{ display: "flex", gap: 12, marginTop: 22 }}>
                {genres.map((g) => (
                  <div
                    key={g}
                    style={{
                      display: "flex",
                      fontSize: 22,
                      color: FG,
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: 999,
                      padding: "6px 18px",
                    }}
                  >
                    {g}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
