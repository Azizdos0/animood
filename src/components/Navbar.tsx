"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ComponentType } from "react";
import {
  HomeIcon, SearchIcon, SparklesIcon, BookmarkIcon, ChartIcon,
} from "@/components/icons";

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
      {/* Top header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3.5 sm:px-6">
          <Link href="/" className="font-display text-xl font-extrabold tracking-tight">
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Animood
            </span>
          </Link>

          {/* Desktop links */}
          <div className="ml-auto hidden items-center gap-1 text-sm font-medium sm:flex">
            {NAV.slice(1).map(({ href, label, Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 transition-colors ${
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  }`}
                >
                  <Icon size={17} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 backdrop-blur-xl sm:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  active ? "text-accent" : "text-muted-foreground"
                }`}
              >
                <Icon size={22} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
