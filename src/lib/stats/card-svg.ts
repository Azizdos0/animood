import type { StatsCardData } from "./card";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DISPLAY = "Sora, Inter, system-ui, sans-serif";
const BODY = "Inter, system-ui, sans-serif";

/** Build a 1200x630 shareable stats card as a standalone SVG string. */
export function buildStatsCardSvg(d: StatsCardData): string {
  const miniStats: [string, string][] = [
    ["TITLES", String(d.titles)],
    ["EPISODES", String(d.episodes)],
    ["MEAN SCORE", d.meanScore],
    ["COMPLETED", `${d.completion}%`],
  ];

  const miniRows = miniStats
    .map(([label, value], i) => {
      const y = 176 + i * 60;
      return `
    <text x="704" y="${y}" font-family="${BODY}" font-size="24" fill="#98a2c0" letter-spacing="1">${esc(label)}</text>
    <text x="1128" y="${y}" text-anchor="end" font-family="${DISPLAY}" font-size="40" font-weight="800" fill="#f5f7ff">${esc(value)}</text>`;
    })
    .join("");

  const genreBars = d.topGenres
    .map((g, i) => {
      const rowY = 512 + i * 44;
      const barW = Math.max(6, (g.pct / 100) * 380);
      return `
    <text x="72" y="${rowY}" font-family="${BODY}" font-size="24" fill="#cbd5e1">${esc(g.name)}</text>
    <rect x="250" y="${rowY - 20}" width="380" height="18" rx="9" fill="rgba(255,255,255,0.08)" />
    <rect x="250" y="${rowY - 20}" width="${barW.toFixed(1)}" height="18" rx="9" fill="url(#accent)" />`;
    })
    .join("");

  const loveLine = d.loveTags.length > 0 ? d.loveTags.map(esc).join("  ·  ") : "—";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b1020" />
      <stop offset="1" stop-color="#161f3d" />
    </linearGradient>
    <radialGradient id="glow1" cx="0.15" cy="0.0" r="0.6">
      <stop offset="0" stop-color="#6366f1" stop-opacity="0.35" />
      <stop offset="1" stop-color="#6366f1" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="glow2" cx="1.0" cy="0.1" r="0.6">
      <stop offset="0" stop-color="#a855f7" stop-opacity="0.28" />
      <stop offset="1" stop-color="#a855f7" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#818cf8" />
      <stop offset="1" stop-color="#a855f7" />
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#glow1)" />
  <rect width="1200" height="630" fill="url(#glow2)" />
  <rect x="1" y="1" width="1198" height="628" rx="24" fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2" />

  <text x="72" y="96" font-family="${DISPLAY}" font-size="42" font-weight="800" fill="url(#accent)">Animood</text>
  <text x="1128" y="96" text-anchor="end" font-family="${BODY}" font-size="20" fill="#98a2c0" letter-spacing="3">MY ANIME &amp; MANGA STATS</text>

  <text x="72" y="270" font-family="${DISPLAY}" font-size="150" font-weight="800" fill="#f5f7ff">${esc(d.days)}</text>
  <text x="80" y="320" font-family="${BODY}" font-size="30" font-weight="700" fill="url(#accent)" letter-spacing="4">DAYS WATCHED</text>
${miniRows}

  <line x1="72" y1="404" x2="1128" y2="404" stroke="rgba(255,255,255,0.10)" stroke-width="2" />

  <text x="72" y="470" font-family="${BODY}" font-size="22" fill="#98a2c0" letter-spacing="3">TOP GENRES</text>
${genreBars}

  <text x="704" y="470" font-family="${BODY}" font-size="22" fill="#a855f7" letter-spacing="3">YOU LOVE</text>
  <text x="704" y="522" font-family="${DISPLAY}" font-size="34" font-weight="700" fill="#f5f7ff">${loveLine}</text>
  <text x="704" y="590" font-family="${BODY}" font-size="20" fill="#6b7594">animood — your taste, tracked</text>
</svg>`;
}
