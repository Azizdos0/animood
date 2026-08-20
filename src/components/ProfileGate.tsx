"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/SyncProvider";

export function ProfileGate() {
  const { needsUsername } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (needsUsername && pathname !== "/welcome") {
      router.replace(`/welcome?next=${encodeURIComponent(pathname)}`);
    }
  }, [needsUsername, pathname, router]);

  return null;
}
