"use client";

import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** How long the target message keeps the transient highlight class. */
const HIGHLIGHT_MS = 1200;

type EvidenceJumpLinkProps = {
  /** Transcript message id the evidence points at (matches `msg-${id}`). */
  messageId: string;
  /** Pre-formatted HH:MM label rendered after the arrow. */
  timeLabel: string;
  className?: string;
};

/**
 * "Доказательство → HH:MM" — scrolls the linked transcript message into view and
 * briefly flashes it. The target lives in the conversation pane (same document),
 * so a same-page anchor is the accessible base; JS upgrades it to a smooth scroll
 * + transient highlight. No data changes, no effect on form state.
 */
export function EvidenceJumpLink({ messageId, timeLabel, className }: EvidenceJumpLinkProps) {
  const targetId = `msg-${messageId}`;
  const highlightTimerRef = useRef<number | null>(null);
  const highlightedTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      highlightedTargetRef.current?.classList.remove(
        "conversation-message--evidence-flash"
      );
    };
  }, []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Inside a collapsible trigger/header, stop the click from toggling the panel.
    event.stopPropagation();

    const target = document.getElementById(targetId);

    if (!target) {
      return;
    }

    event.preventDefault();
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center"
    });

    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    if (highlightedTargetRef.current !== target) {
      highlightedTargetRef.current?.classList.remove(
        "conversation-message--evidence-flash"
      );
    }

    // Static class feedback remains visible when animation is reduced.
    target.classList.remove("conversation-message--evidence-flash");
    target.classList.add("conversation-message--evidence-flash");
    highlightedTargetRef.current = target;
    highlightTimerRef.current = window.setTimeout(() => {
      target.classList.remove("conversation-message--evidence-flash");
      highlightTimerRef.current = null;
      highlightedTargetRef.current = null;
    }, HIGHLIGHT_MS);
  }

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      data-qc-motion="feedback"
      className={cn(
        "text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        className
      )}
      aria-label={`Перейти к сообщению-доказательству, ${timeLabel}`}
    >
      Доказательство → {timeLabel}
    </a>
  );
}
