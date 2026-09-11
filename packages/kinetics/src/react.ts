"use client";

import { useEffect, useState } from "react";

/**
 * True when the user prefers reduced motion.
 * Defaults to `false` on first paint so SSR/hydration keep spring entrance;
 * an effect flips it when `(prefers-reduced-motion: reduce)` matches.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
}
