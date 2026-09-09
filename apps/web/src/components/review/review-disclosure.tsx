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

function writeAriaAttribute(details: HTMLDetailsElement) {
  const summary =
    details.querySelector("summary[data-slot=review-disclosure-trigger]") ??
    details.querySelector("[data-slot=review-disclosure-trigger]");
  if (summary instanceof HTMLElement) {
    summary.setAttribute("aria-expanded", details.open ? "true" : "false");
  }
}

/**
 * Same-turn `getAttribute("aria-expanded")` for keyboard / tests.
 * React state is updated by the `toggle` listener; this write must match
 * `details.open` immediately (2da9198 / account-menu pattern).
 */
export function syncReviewDisclosureAria(details: HTMLDetailsElement) {
  const key = details.getAttribute("data-review-disclosure-key");
  if (key) {
    reviewDisclosureMemory.set(key, details.open);
  }
  writeAriaAttribute(details);
}

function syncFromDetails(
  details: HTMLDetailsElement | null,
  memoryKey: string,
  commit: (open: boolean) => void
) {
  if (!details) {
    return;
  }
  reviewDisclosureMemory.set(memoryKey, details.open);
  commit(details.open);
  writeAriaAttribute(details);
}

type ReviewDisclosureProps = Omit<
  ComponentProps<"details">,
  "open" | "defaultOpen" | "onToggle"
> & {
  memoryKey: string;
  defaultOpen?: boolean;
  trigger: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
};

/**
 * Native `<details>` owns open. `aria-expanded` is a React prop bound to
 * state that always mirrors `details.open` (2da9198 / AccountMenuDisclosure).
 * A native `toggle` listener writes the attribute in the same turn as the UA
 * click; JSX keeps the prop so later commits do not strip it.
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
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(
    () => reviewDisclosureMemory.get(memoryKey) ?? defaultOpen
  );

  const attachDetails = useCallback((root: HTMLDetailsElement | null) => {
    detailsRef.current = root;
  }, []);

  useLayoutEffect(() => {
    const root = detailsRef.current;
    if (!root) {
      return;
    }
    // After React commit — assigning `open` in the ref is reset when `<details>`
    // has no `open` prop. Apply memory / defaultOpen once, then sync state.
    if (root.dataset.disclosureReady !== "1") {
      const stored = reviewDisclosureMemory.get(memoryKey) ?? defaultOpen;
      if (root.open !== stored) {
        root.open = stored;
      }
      root.dataset.disclosureReady = "1";
    }
    const onNativeToggle = () => {
      syncFromDetails(root, memoryKey, setExpanded);
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
        syncFromDetails(event.currentTarget, memoryKey, setExpanded);
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
          queueMicrotask(() => {
            syncFromDetails(root, memoryKey, setExpanded);
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
