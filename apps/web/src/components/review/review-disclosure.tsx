"use client";

import { useLayoutEffect, useRef, type ComponentProps, type ReactNode, type ToggleEvent } from "react";
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
 * Always write the attribute from `details.open`. Never drive it from React state —
 * a stale `aria-expanded={true}` overwrites DOM writes on every commit (LIVE 14f7bf6).
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
 * Native `<details>` owns open. `aria-expanded` is a DOM attribute only,
 * always copied from `details.open` (mount, toggle, click, keyboard).
 *
 * Initial `open` is applied in `useLayoutEffect` — not in the ref callback —
 * because React's commit of `<details>` without an `open` prop resets a
 * ref-time `root.open = true` back to false (LIVE: aria=true, open=false).
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

  useLayoutEffect(() => {
    const root = detailsRef.current;
    if (!root) {
      return;
    }
    if (root.dataset.disclosureReady !== "1") {
      const stored = reviewDisclosureMemory.get(memoryKey) ?? defaultOpen;
      if (root.open !== stored) {
        root.open = stored;
      }
      root.dataset.disclosureReady = "1";
    }
    syncReviewDisclosureAria(root);
    const onNativeToggle = () => {
      syncReviewDisclosureAria(root);
    };
    root.addEventListener("toggle", onNativeToggle);
    return () => root.removeEventListener("toggle", onNativeToggle);
  }, [memoryKey, defaultOpen]);

  return (
    <details
      {...props}
      ref={detailsRef}
      data-review-disclosure-key={memoryKey}
      className={cn("group", className)}
      onToggle={(event: ToggleEvent<HTMLDetailsElement>) => {
        syncReviewDisclosureAria(event.currentTarget);
      }}
    >
      <summary
        role="button"
        data-slot="review-disclosure-trigger"
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
            syncReviewDisclosureAria(root);
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
