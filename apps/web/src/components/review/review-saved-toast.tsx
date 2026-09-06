"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/ui/toast";
import {
  coachingOfferFromSearchParams,
  coachingPlanCreateHref
} from "@/lib/coaching-follow-up";
import { toast as sonnerToast } from "sonner";

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
 * When finalize carried a coaching offer (`coachOffer=1` + agent/review ids),
 * the final toast adds a Russian CTA to open the coaching plan form.
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
    const offer =
      typeof window !== "undefined" ? coachingOfferFromSearchParams(new URL(window.location.href).searchParams) : null;

    if (marker === "final" && offer) {
      const href = coachingPlanCreateHref({
        agentName: offer.agentName,
        reviewId: offer.reviewId,
        conversationId: offer.conversationId
      });
      sonnerToast.success(message, {
        description: `Низкий балл или критическое замечание у ${offer.agentName}. Можно открыть план коучинга или создать учебную задачу на проверке.`,
        duration: 12_000,
        action: {
          label: "План коучинга",
          onClick: () => {
            window.location.assign(href);
          }
        }
      });
    } else {
      toast.success(message);
    }

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("saved");
      url.searchParams.delete("coachOffer");
      url.searchParams.delete("coachAgent");
      url.searchParams.delete("coachReviewId");
      url.searchParams.delete("coachConversationId");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [marker, toast]);

  return null;
}
