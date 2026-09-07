"use client";

import { Inbox, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { takeNextReview } from "@/lib/queue-view-actions";
import {
  QUEUE_EMPTY_RESET_FILTERS_LABEL,
  QUEUE_EMPTY_TAKE_UNFILTERED_LABEL,
  queueEmptyBannerMessage
} from "@/lib/review/queue-empty-copy";

type QueueEmptyBannerProps = {
  hasActiveFilters?: boolean;
  /** Inbox home after reset. Analyst keeps mine+overdue; others go to `/reviews`. */
  resetHref?: string;
  /** reviews:write — hide unfiltered take-next for EXEC / SUPPORT_AGENT. */
  canWriteReviews?: boolean;
};

/**
 * Brief, dismissible banner after `takeNext` / finalize-and-take-next finds
 * nothing in the current view and redirects with `empty=1`. Filtered views use
 * view-scoped copy and recovery CTAs — the workspace may still have work
 * outside the chips. Dismissing also strips `empty` from the URL.
 */
export function QueueEmptyBanner({
  hasActiveFilters = false,
  resetHref = "/reviews",
  canWriteReviews = false
}: QueueEmptyBannerProps) {
  const [visible, setVisible] = useState(true);

  // Defensive: if the page ever renders this with the param already gone, hide.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (!params.has("empty")) {
      setVisible(false);
    }
  }, []);

  function dismiss() {
    setVisible(false);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("empty");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <Alert role="status">
      <Inbox size={18} aria-hidden="true" />
      <AlertDescription>{queueEmptyBannerMessage(hasActiveFilters)}</AlertDescription>
      {hasActiveFilters ? (
        <div className="col-start-2 mt-1 flex flex-wrap items-center gap-2">
          <Button render={<Link href={resetHref} />} nativeButton={false} variant="outline" size="sm">
            {QUEUE_EMPTY_RESET_FILTERS_LABEL}
          </Button>
          {canWriteReviews ? (
            <form action={takeNextReview}>
              <Button type="submit" variant="outline" size="sm">
                {QUEUE_EMPTY_TAKE_UNFILTERED_LABEL}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
      <AlertAction>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          onClick={dismiss}
          aria-label="Скрыть уведомление"
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}
