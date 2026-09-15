import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { SyncProvider } from "@/components/SyncProvider";
import { ProfileGate } from "@/components/ProfileGate";

const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "800", "900"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const SITE_URL = "https://animood-app.vercel.app";
const SITE_DESCRIPTION =
  "Track the anime and manga you love and discover your next favorite, shaped by your taste and your mood. No account required.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Animood — a story for every mood",
    template: "%s · Animood",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Animood",
  icons: { icon: "/icon.svg" },
  openGraph: {
    type: "website",
    siteName: "Animood",
    url: SITE_URL,
    title: "Animood — a story for every mood",
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: "Animood — a story for every mood",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SyncProvider>
          <Navbar />
          <ProfileGate />
          <main className="flex-1 pb-24 sm:pb-0">{children}</main>
          <footer className="mx-auto flex w-full max-w-[1560px] flex-wrap items-center justify-between gap-6 border-t border-border px-6 py-11 sm:px-10">
            <div className="flex items-baseline gap-2.5">
              <span className="text-3xl font-black tracking-[-0.04em]">ANIMOOD</span>
              <span className="jp text-base text-violet">アニムード</span>
            </div>
            <div className="mono text-right text-[11px] leading-7 tracking-[0.1em] text-muted-2">
              DATA FROM ANILIST<br />YOUR LIST LIVES IN THIS BROWSER
            </div>
          </footer>
        </SyncProvider>
      </body>
    </html>
  );
}
