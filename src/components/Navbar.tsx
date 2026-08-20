"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ComponentType } from "react";
import {
  HomeIcon, SearchIcon, SparklesIcon, BookmarkIcon, ChartIcon,
} from "@/components/icons";
import { AuthButton } from "@/components/AuthButton";

interface NavItem {
  href: Route;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

const NAV: NavItem[] = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/search", label: "Search", Icon: SearchIcon },
  { href: "/recommendations", label: "For You", Icon: SparklesIcon },
  { href: "/my-list", label: "My List", Icon: BookmarkIcon },
  { href: "/stats", label: "Stats", Icon: ChartIcon },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Navbar() {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center gap-6 border-b border-border bg-background/85 px-5 py-[15px] backdrop-blur-xl sm:gap-10 sm:px-10">
        <Link href="/" aria-label="Animood home" className="flex items-baseline gap-2 transition-opacity hover:opacity-90">
          <span className="text-[22px] font-black leading-none tracking-[-0.03em]">ANIMOOD</span>
          <span className="jp text-[15px] leading-none text-pink">アニムード</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-[13px] font-semibold tracking-[0.02em] sm:flex">
          {NAV.map(({ href, label }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`transition-colors hover:text-foreground ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <AuthButton />
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${active ? "text-pink" : "text-muted-foreground"}`}
              >
                <Icon size={21} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
