"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type ToggleEvent
} from "react";
import { cn } from "@/lib/utils";

/**
 * Session memory for review disclosures. A remounted RSC slot would otherwise
 * re-apply `defaultOpen` and look dead. The UA owns `details.open`; this map
 * only restores it after remount.
 */
const reviewDisclosureMemory = new Map<string, boolean>();

export function resetReviewDisclosureMemory() {
  reviewDisclosureMemory.clear();
}

/**
 * LIVE ComputerUse reads `getAttribute("aria-expanded")` on the summary.
 * Always write the attribute from `details.open` — do not wait for React state.
 */
export function syncReviewDisclosureAria(details: HTMLDetailsElement) {
  const summary = details.querySelector("[data-slot=review-disclosure-trigger]");
  if (summary instanceof HTMLElement) {
    summary.setAttribute("aria-expanded", details.open ? "true" : "false");
  }
  const key = details.getAttribute("data-review-disclosure-key");
  if (key) {
    reviewDisclosureMemory.set(key, details.open);
  }
}

function persistAndSyncAria(details: HTMLDetailsElement, memoryKey: string) {
  reviewDisclosureMemory.set(memoryKey, details.open);
  syncReviewDisclosureAria(details);
}

type ReviewDisclosureProps = Omit<
  ComponentProps<"details">,
  "open" | "defaultOpen" | "onToggle"
> & {
  /** Stable id for this ticket + disclosure (survives remount). */
  memoryKey: string;
  defaultOpen?: boolean;
  trigger: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
};

/**
 * Native `<details>` owns open. `aria-expanded` is written from `details.open`
 * on every `toggle`, on mount, and after a summary click (microtask) so a
 * missed `toggle` event cannot leave the SSR `"true"` sticky.
 *
 * The `<summary>` is created here — not passed in from an RSC parent.
 */
export function ReviewDisclosure({
  memoryKey,
  defaultOpen = false,
  trigger,
  triggerClassName,
  contentClassName,
  className,
  children,
  ...props
}: ReviewDisclosureProps) {
  const initialOpen = reviewDisclosureMemory.get(memoryKey) ?? defaultOpen;
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(initialOpen);

  const syncFromDetails = useCallback(
    (details: HTMLDetailsElement | null) => {
      if (!details) {
        return;
      }
      persistAndSyncAria(details, memoryKey);
      setExpanded(details.open);
    },
    [memoryKey]
  );

  const attachDetails = useCallback(
    (root: HTMLDetailsElement | null) => {
      detailsRef.current = root;
      if (!root) {
        return;
      }
      // Do not pass `open`/`defaultOpen` to <details> — React treats `open` as
      // controlled (stuck if handlers never fire) and ignores `defaultOpen`.
      const stored = reviewDisclosureMemory.get(memoryKey) ?? defaultOpen;
      if (root.open !== stored) {
        root.open = stored;
      }
      persistAndSyncAria(root, memoryKey);
      setExpanded(root.open);
    },
    [memoryKey, defaultOpen]
  );

  useLayoutEffect(() => {
    const root = detailsRef.current;
    if (!root) {
      return;
    }
    const onNativeToggle = () => {
      syncFromDetails(root);
    };
    root.addEventListener("toggle", onNativeToggle);
    onNativeToggle();
    return () => root.removeEventListener("toggle", onNativeToggle);
  });

  return (
    <details
      {...props}
      ref={attachDetails}
      data-review-disclosure-key={memoryKey}
      className={cn("group", className)}
      onToggle={(event: ToggleEvent<HTMLDetailsElement>) => {
        syncFromDetails(event.currentTarget);
      }}
    >
      <summary
        role="button"
        data-slot="review-disclosure-trigger"
        aria-expanded={expanded ? "true" : "false"}
        className={cn(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden [&_*]:pointer-events-none",
          triggerClassName
        )}
        onClick={() => {
          const root = detailsRef.current;
          if (!root) {
            return;
          }
          // UA toggles `open` on this click. `toggle` is not reliable after
          // programmatic `.open` flips and has been missed on LIVE; sync from
          // the post-click open state so aria cannot stay at the SSR value.
          queueMicrotask(() => {
            syncFromDetails(root);
          });
        }}
      >
        {trigger}
      </summary>
      <div data-slot="review-disclosure-panel" className={contentClassName}>
        {children}
      </div>
    </details>
  );
}
