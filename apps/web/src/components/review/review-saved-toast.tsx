"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";

const savedMessages: Record<string, string> = {
  draft: "Черновик проверки сохранён.",
  final: "Проверка завершена."
};

/**
 * Surfaces the post-redirect grading success as a toast on the destination page.
 *
 * Save & finalize always redirect, so the success confirmation cannot be
 * returned from the action — it rides the destination URL as `?saved=draft|final`
 * (see `withSavedMarker` in review-actions). This mounts on the destination,
 * fires the toast once, then strips the marker from the address bar via
 * `history.replaceState` so a refresh or back-nav does not re-announce it.
 *
 * Render-only: takes the already-parsed marker as a prop (server reads the
 * search param) and owns no routing. A neutral/unknown marker is a no-op.
 */
export function ReviewSavedToast({ marker }: { marker?: string }) {
  const toast = useToast();
  const announced = useRef(false);

  useEffect(() => {
    if (announced.current || !marker) {
      return;
    }

    const message = savedMessages[marker];

    if (!message) {
      return;
    }

    announced.current = true;
    toast.success(message);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("saved");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [marker, toast]);

  return null;
}
