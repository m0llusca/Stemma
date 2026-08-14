"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";

const desktopCommandBarQuery = "(min-width: 80rem)";

type QueueCommandBarPresentationState = "resting" | "stuck";

type QueueCommandBarStateProps = {
  ariaLabel: string;
  children: ReactNode;
  expandedOnly?: ReactNode;
  stuckOnly?: ReactNode;
};

function getTopbarRootMargin() {
  const rawHeight = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-topbar-height");
  const parsedHeight = Number.parseFloat(rawHeight);
  const topbarHeight = Number.isFinite(parsedHeight) ? parsedHeight : 0;

  return `-${topbarHeight}px 0px 0px 0px`;
}

function useQueueCommandBarPresentation(
  sentinelRef: RefObject<HTMLDivElement | null>
) {
  const [state, setState] =
    useState<QueueCommandBarPresentationState>("resting");

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (sentinel == null || typeof window.matchMedia !== "function") {
      return;
    }

    const desktopMedia = window.matchMedia(desktopCommandBarQuery);
    let observer: IntersectionObserver | null = null;

    const syncObserver = () => {
      observer?.disconnect();
      observer = null;
      setState("resting");

      if (
        !desktopMedia.matches ||
        typeof window.IntersectionObserver !== "function"
      ) {
        return;
      }

      observer = new IntersectionObserver(
        ([entry]) => {
          setState(entry?.isIntersecting === false ? "stuck" : "resting");
        },
        {
          rootMargin: getTopbarRootMargin()
        }
      );
      observer.observe(sentinel);
    };

    syncObserver();
    desktopMedia.addEventListener("change", syncObserver);

    return () => {
      desktopMedia.removeEventListener("change", syncObserver);
      observer?.disconnect();
    };
  }, [sentinelRef]);

  return state;
}

export function QueueCommandBarState({
  ariaLabel,
  children,
  expandedOnly,
  stuckOnly
}: QueueCommandBarStateProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const state = useQueueCommandBarPresentation(sentinelRef);

  return (
    <>
      <div
        ref={sentinelRef}
        data-slot="review-queue-command-sentinel"
        aria-hidden="true"
      />
      <section
        data-slot="review-queue-command-bar"
        data-state={state}
        className="group/queue-command-bar sticky top-[var(--app-topbar-height)] z-10 min-w-0"
        aria-label={ariaLabel}
      >
        <div
          className="group-data-[state=stuck]/queue-command-bar:hidden"
          data-expanded-only
        >
          {expandedOnly}
        </div>
        {children}
        <div
          className="hidden group-data-[state=stuck]/queue-command-bar:block"
          data-stuck-only
        >
          {stuckOnly}
        </div>
      </section>
    </>
  );
}
