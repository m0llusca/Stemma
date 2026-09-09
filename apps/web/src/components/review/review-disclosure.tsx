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
 * re-apply `defaultOpen` and look dead.
 */
const reviewDisclosureMemory = new Map<string, boolean>();

export function resetReviewDisclosureMemory() {
  reviewDisclosureMemory.clear();
}

function writeAriaAttribute(details: HTMLDetailsElement, open: boolean = details.open) {
  const summary =
    details.querySelector("summary[data-slot=review-disclosure-trigger]") ??
    details.querySelector("[data-slot=review-disclosure-trigger]");
  if (summary instanceof HTMLElement) {
    summary.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

/**
 * Prefer `toggle` `newState` — React 19 can reset `details.open` to the
 * previous `open` prop before the handler runs. Fall back to the IDL.
 */
function readToggleOpen(event: { newState?: string; currentTarget: EventTarget | null }): boolean {
  if (event.newState === "open") {
    return true;
  }
  if (event.newState === "closed") {
    return false;
  }
  return event.currentTarget instanceof HTMLDetailsElement ? event.currentTarget.open : false;
}

/**
 * Same-turn `getAttribute("aria-expanded")` for keyboard / tests.
 * React state is updated by the `toggle` listener.
 */
export function syncReviewDisclosureAria(details: HTMLDetailsElement) {
  const key = details.getAttribute("data-review-disclosure-key");
  if (key) {
    reviewDisclosureMemory.set(key, details.open);
  }
  writeAriaAttribute(details);
}

function syncFromToggle(
  event: { newState?: string; currentTarget: EventTarget | null },
  memoryKey: string,
  commit: (open: boolean) => void
) {
  const next = readToggleOpen(event);
  const details = event.currentTarget instanceof HTMLDetailsElement ? event.currentTarget : null;
  reviewDisclosureMemory.set(memoryKey, next);
  commit(next);
  if (details) {
    writeAriaAttribute(details, next);
  }
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
 * `open` and `aria-expanded` share one React state so they cannot diverge.
 * Uncontrolled `<details>` (no `open` prop) starts closed while `defaultOpen`
 * left `expanded` true — LIVE 8989a9a: aria stuck true, visual toggled.
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
    const onNativeToggle = (event: Event) => {
      syncFromToggle(event, memoryKey, setExpanded);
    };
    root.addEventListener("toggle", onNativeToggle);
    writeAriaAttribute(root);
    return () => root.removeEventListener("toggle", onNativeToggle);
  }, [memoryKey]);

  return (
    <details
      {...props}
      ref={attachDetails}
      open={expanded}
      data-review-disclosure-key={memoryKey}
      className={cn("group", className)}
      onToggle={(event: ToggleEvent<HTMLDetailsElement>) => {
        syncFromToggle(event, memoryKey, setExpanded);
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
      >
        {trigger}
      </summary>
      <div data-slot="review-disclosure-panel" className={contentClassName}>
        {children}
      </div>
    </details>
  );
}
