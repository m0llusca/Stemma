"use client";

import { ChevronDown, ChevronUp } from "lucide";
import { useLayoutEffect, useRef, useState } from "react";

import { MorphIcon } from "@/components/ui/morph-icon";
import { cn } from "@/lib/utils";

type DisclosureMorphChevronProps = {
  /** When omitted, the chevron watches the closest trigger’s `aria-expanded`. */
  open?: boolean;
  className?: string;
  "data-slot"?: string;
  "data-icon"?: "inline-start" | "inline-end";
};

function triggerIsExpanded(trigger: Element) {
  if (trigger.getAttribute("aria-expanded") === "true") {
    return true;
  }
  const root = trigger.closest(
    "[data-slot='collapsible'], [data-slot='accordion-item'], details[data-review-disclosure-key]"
  );
  return (
    root?.hasAttribute("data-open") === true ||
    root?.getAttribute("data-open") === "" ||
    root?.getAttribute("data-review-open") === "true"
  );
}

/**
 * ChevronDown ↔ ChevronUp via Morphicons. Used on accordion / score-module
 * disclosures only (#117 UX-ACCEPT). Not for queue chrome or account menu.
 */
export function DisclosureMorphChevron({
  open,
  className,
  "data-slot": dataSlot = "disclosure-morph-chevron",
  "data-icon": dataIcon
}: DisclosureMorphChevronProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [observedOpen, setObservedOpen] = useState(false);
  const resolvedOpen = open ?? observedOpen;

  useLayoutEffect(() => {
    if (open !== undefined) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const trigger = host.closest(
      "[data-slot='accordion-trigger'], [data-slot='collapsible-trigger'], [data-slot='review-disclosure-trigger'], [data-slot='account-menu'], button, summary"
    );
    if (!trigger) {
      return;
    }

    const sync = () => {
      setObservedOpen(triggerIsExpanded(trigger));
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(trigger, { attributes: true, attributeFilter: ["aria-expanded", "data-open"] });
    const root = trigger.closest(
      "[data-slot='collapsible'], [data-slot='accordion-item'], details[data-review-disclosure-key]"
    );
    if (root && root !== trigger) {
      observer.observe(root, { attributes: true, attributeFilter: ["data-open", "data-review-open"] });
    }
    return () => observer.disconnect();
  }, [open]);

  return (
    <span
      ref={hostRef}
      data-slot={dataSlot}
      className={cn("inline-flex shrink-0", className)}
      aria-hidden="true"
    >
      <MorphIcon icon={resolvedOpen ? ChevronUp : ChevronDown} data-icon={dataIcon} />
    </span>
  );
}
