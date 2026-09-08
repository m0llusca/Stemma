"use client";

import { usePathname } from "next/navigation";
import { isAuthPath } from "@/lib/auth/auth-path";

/**
 * Header-height placeholder while `useSearchParams` resolves inside AppNavShell.
 * Auth entry routes must stay empty — a min-h-14 strip on `/auth/login` is the
 * product chrome Roman reported on the LIVE demo.
 */
export function AppNavFallback() {
  const pathname = usePathname();
  if (isAuthPath(pathname)) {
    return null;
  }

  return (
    <header
      className="sticky top-0 z-20 min-h-14 border-b border-border bg-background"
      aria-busy="true"
      aria-label="Глобальная навигация"
      data-slot="app-nav"
    />
  );
}
