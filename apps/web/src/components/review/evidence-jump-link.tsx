"use client";

import type { MouseEvent } from "react";

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

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    // Inside a <details><summary>, stop the click from toggling the disclosure.
    event.stopPropagation();

    const target = document.getElementById(targetId);

    if (!target) {
      return;
    }

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "center" });

    // Restart the flash even if the same message was just highlighted.
    target.classList.remove("conversation-message--evidence-flash");
    void target.offsetWidth;
    target.classList.add("conversation-message--evidence-flash");
    window.setTimeout(() => {
      target.classList.remove("conversation-message--evidence-flash");
    }, HIGHLIGHT_MS);
  }

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      className={className}
      aria-label={`Перейти к сообщению-доказательству, ${timeLabel}`}
    >
      Доказательство → {timeLabel}
    </a>
  );
}
