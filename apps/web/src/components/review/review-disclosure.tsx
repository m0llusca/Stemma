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
  const summary = details.querySelector("[data-slot=review-disclosure-trigger]");
  if (summary instanceof HTMLElement) {
    summary.setAttribute("aria-expanded", details.open ? "true" : "false");
  }
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
  /** Stable id for this ticket + disclosure (survives remount). */
  memoryKey: string;
  defaultOpen?: boolean;
  trigger: ReactNode;
  triggerClassName?: string;
  contentClassName?: string;
};

/**
 * Native `<details>` owns open. A native `toggle` listener writes
 * `aria-expanded` in the same turn as the UA click (React onToggle/setState
 * is too late for same-turn getAttribute). JSX still has the prop so later
 * commits do not strip it.
 *
 * The `<summary>` is created here — not passed in from an RSC parent — so the
 * listener and the hit target live on the same client island.
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
      syncFromDetails(root, memoryKey, setExpanded);
    },
    [memoryKey, defaultOpen]
  );

  useLayoutEffect(() => {
    const root = detailsRef.current;
    if (!root) {
      return;
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
      ref={attachDetails}
      className={cn("group", className)}
      onToggle={(event: ToggleEvent<HTMLDetailsElement>) => {
        syncFromDetails(event.currentTarget, memoryKey, setExpanded);
      }}
      {...props}
    >
      <summary
        role="button"
        data-slot="review-disclosure-trigger"
        aria-expanded={expanded ? "true" : "false"}
        className={cn(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden [&_*]:pointer-events-none",
          triggerClassName
        )}
      >
        {trigger}
      </summary>
      <div data-slot="review-disclosure-panel" className={contentClassName}>
        {children}
      </div>
    </details>
  );
}
