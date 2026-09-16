import { ImageResponse } from "next/og";

// Site-wide Open Graph / Twitter share image (1200x630), generated at build.
export const alt = "Animood — a story for every mood";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0a0a0d",
          padding: "84px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: "0.32em",
            color: "#8b8b93",
          }}
        >
          TRACK · DISCOVER · OBSESS
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 150,
              fontWeight: 900,
              color: "#f4f2ef",
              letterSpacing: "-0.05em",
              lineHeight: 1,
            }}
          >
            ANIMOOD
          </div>
          <div style={{ display: "flex", fontSize: 56, marginTop: 28, letterSpacing: "-0.02em" }}>
            <span style={{ color: "#f4f2ef" }}>A story for&nbsp;</span>
            <span style={{ color: "#f472b6" }}>every mood.</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", fontSize: 26, color: "#a78bfa", letterSpacing: "0.06em" }}>
            animood-app.vercel.app
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#5f5f68", letterSpacing: "0.18em" }}>
            DATA FROM ANILIST
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
