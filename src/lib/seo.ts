import type { Metadata } from "next";

// The site-wide share image (src/app/opengraph-image.tsx) is attached to the
// root layout by Next's file convention. A child route that sets its own
// `openGraph`/`twitter` object REPLACES the inherited one (metadata is shallow-
// merged per segment), which drops the image and resets the card type. This
// helper re-carries both so per-page share cards keep the image + large card
// while showing the page's own title/description.
const OG_IMAGE = "/opengraph-image";

// `image` lets a route point at its own share image (e.g. a per-media
// opengraph-image route). Explicit metadata images win over the file
// convention in this Next version, so this is the deterministic way to give a
// page a bespoke card while keeping the large-image twitter card.
export function pageMetadata({
  title,
  description,
  image = OG_IMAGE,
}: {
  title: string;
  description: string;
  image?: string;
}): Metadata {
  const shareTitle = `${title} · Animood`;
  return {
    title, // flows through the layout's `%s · Animood` <title> template
    description,
    openGraph: { title: shareTitle, description, images: [image] },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [image] },
  };
}
