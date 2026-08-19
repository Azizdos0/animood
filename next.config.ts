import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint and types are enforced in CI/local (npm test, tsc, eslint); don't let
  // them fail the production build in the deploy environment.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    // AniList cover/banner images (used via <img>, but declare for safety).
    remotePatterns: [{ protocol: "https", hostname: "s4.anilist.co" }],
  },
};

export default nextConfig;
