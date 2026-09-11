"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { DisclosureOpenProvider } from "@/components/ui/disclosure-morph-chevron";
import { cn } from "@/lib/utils";

/**
 * Session memory for review disclosures. A remounted RSC slot would otherwise
 * re-apply `defaultOpen` and look dead.
 */
const reviewDisclosureMemory = new Map<string, boolean>();

export function resetReviewDisclosureMemory() {
  reviewDisclosureMemory.clear();
}

export const REVIEW_DISCLOSURE_COMMAND = "review-disclosure-command";

function writeAriaAttribute(details: HTMLDetailsElement, open: boolean) {
  const summary =
    details.querySelector("summary[data-slot=review-disclosure-trigger]") ??
    details.querySelector("[data-slot=review-disclosure-trigger]");
  if (summary instanceof HTMLElement) {
    summary.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

/**
 * Same-turn aria write from the React SoT (`next`), never from `details.open`
 * (React 19 can reset that IDL before handlers run).
 */
export function syncReviewDisclosureAria(details: HTMLDetailsElement, next?: boolean) {
  const open = typeof next === "boolean" ? next : details.getAttribute("data-review-open") === "true";
  const key = details.getAttribute("data-review-disclosure-key");
  if (key) {
    reviewDisclosureMemory.set(key, open);
  }
  writeAriaAttribute(details, open);
}

export function commandReviewDisclosure(details: HTMLDetailsElement, next?: boolean) {
  details.dispatchEvent(new CustomEvent(REVIEW_DISCLOSURE_COMMAND, { detail: { next } }));
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
 * React state is the only SoT for both `open` and `aria-expanded`.
 * Summary click / Enter / Space call `setExpanded(v => !v)` after
 * preventDefault so the UA cannot flash-open a controlled details
 * (LIVE 39be8da: aria stuck false, Enter did not persist).
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

  const commit = useCallback(
    (next: boolean) => {
      reviewDisclosureMemory.set(memoryKey, next);
      setExpanded(next);
      const root = detailsRef.current;
      if (root) {
        writeAriaAttribute(root, next);
      }
    },
    [memoryKey]
  );

  const toggle = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      reviewDisclosureMemory.set(memoryKey, next);
      const root = detailsRef.current;
      if (root) {
        writeAriaAttribute(root, next);
      }
      return next;
    });
  }, [memoryKey]);

  useLayoutEffect(() => {
    const root = detailsRef.current;
    if (!root) {
      return;
    }
    const onCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ next?: boolean }>).detail;
      if (typeof detail?.next === "boolean") {
        commit(detail.next);
        return;
      }
      toggle();
    };
    root.addEventListener(REVIEW_DISCLOSURE_COMMAND, onCommand);
    return () => root.removeEventListener(REVIEW_DISCLOSURE_COMMAND, onCommand);
  }, [commit, toggle]);

  return (
    <details
      {...props}
      ref={detailsRef}
      open={expanded}
      data-review-disclosure-key={memoryKey}
      data-review-open={expanded ? "true" : "false"}
      className={cn("group", className)}
    >
      <summary
        role="button"
        data-slot="review-disclosure-trigger"
        aria-expanded={expanded ? "true" : "false"}
        className={cn(
          "cursor-pointer list-none [&::-webkit-details-marker]:hidden [&_*]:pointer-events-none",
          triggerClassName
        )}
        onClick={(event) => {
          event.preventDefault();
          toggle();
        }}
        onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
          if (event.key !== "Enter" && event.key !== " ") {
            return;
          }
          event.preventDefault();
          toggle();
        }}
      >
        <DisclosureOpenProvider open={expanded}>{trigger}</DisclosureOpenProvider>
      </summary>
      <div data-slot="review-disclosure-panel" className={contentClassName}>
        {children}
      </div>
    </details>
  );
}
