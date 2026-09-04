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

function isElementVisible(element: HTMLElement) {
  return element.getClientRects().length > 0;
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

/**
 * When stuck mode hides expanded-only chrome, restore focus to a still-visible
 * control inside the sticky bar (or the bar itself) so keyboard users are not
 * stranded on a display:none node.
 */
function useStickyFocusRestore(
  barRef: RefObject<HTMLElement | null>,
  state: QueueCommandBarPresentationState
) {
  const previousStateRef = useRef(state);

  useEffect(() => {
    if (previousStateRef.current === state) {
      return;
    }

    previousStateRef.current = state;
    const bar = barRef.current;
    if (!bar) {
      return;
    }

    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !bar.contains(active)) {
      return;
    }

    const inExpandedOnly = active.closest("[data-expanded-only]");
    const inStuckOnly = active.closest("[data-stuck-only]");
    const focusTrappedInHiddenRegion =
      (state === "stuck" && inExpandedOnly != null) ||
      (state === "resting" && inStuckOnly != null) ||
      !isElementVisible(active);

    if (!focusTrappedInHiddenRegion) {
      return;
    }

    const stableControls = Array.from(
      bar.querySelectorAll<HTMLElement>(
        "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])"
      )
    ).filter((candidate) => {
      const expanded = candidate.closest("[data-expanded-only]");
      const stuck = candidate.closest("[data-stuck-only]");
      if (state === "stuck" && expanded) return false;
      if (state === "resting" && stuck) return false;
      return true;
    });

    const fallback = stableControls[0] ?? bar;

    if (fallback === bar && !bar.hasAttribute("tabindex")) {
      bar.tabIndex = -1;
    }

    fallback.focus({ preventScroll: true });
  }, [barRef, state]);
}

export function QueueCommandBarState({
  ariaLabel,
  children,
  expandedOnly,
  stuckOnly
}: QueueCommandBarStateProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const state = useQueueCommandBarPresentation(sentinelRef);
  useStickyFocusRestore(barRef, state);

  return (
    <>
      <div
        ref={sentinelRef}
        data-slot="review-queue-command-sentinel"
        aria-hidden="true"
      />
      <section
        ref={barRef}
        data-slot="review-queue-command-bar"
        data-state={state}
        className="group/queue-command-bar sticky top-[var(--app-topbar-height)] z-10 min-w-0 overflow-clip rounded-xl border border-border bg-card shadow-sm"
        aria-label={ariaLabel}
      >
        {expandedOnly != null ? (
          <div
            className="group-data-[state=stuck]/queue-command-bar:hidden"
            data-expanded-only
          >
            {expandedOnly}
          </div>
        ) : null}
        {children}
        {stuckOnly != null ? (
          <div
            className="hidden group-data-[state=stuck]/queue-command-bar:block"
            data-stuck-only
          >
            {stuckOnly}
          </div>
        ) : null}
      </section>
    </>
  );
}
