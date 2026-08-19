import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";

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

export const metadata: Metadata = {
  title: "Animood",
  description: "A modern anime & manga tracker. Track. Discover. Obsess.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${archivo.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
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
      </body>
    </html>
  );
}
