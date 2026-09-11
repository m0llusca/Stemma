"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

import { MorphIcon } from "@/components/ui/morph-icon";
import { cn } from "@/lib/utils";

type DisclosureMorphChevronProps = {
  /** When omitted, the chevron watches the closest disclosure SoT. */
  open?: boolean;
  className?: string;
  "data-slot"?: string;
  "data-icon"?: "inline-start" | "inline-end";
};

const DisclosureOpenContext = createContext<boolean | undefined>(undefined);

/** Live open SoT for nested chevrons (ReviewDisclosure `expanded`). */
export function DisclosureOpenProvider({
  open,
  children
}: {
  open: boolean;
  children: ReactNode;
}) {
  return <DisclosureOpenContext.Provider value={open}>{children}</DisclosureOpenContext.Provider>;
}

const TRIGGER_SELECTOR =
  "[data-slot='accordion-trigger'], [data-slot='collapsible-trigger'], [data-slot='review-disclosure-trigger'], [data-slot='account-menu'], button, summary";

const ROOT_SELECTOR =
  "[data-slot='collapsible'], [data-slot='accordion-item'], details[data-review-disclosure-key], details";

function flagTrue(value: string | null) {
  return value === "true" || value === "";
}

/**
 * Real disclosure SoT: controlled aria, details.open, then data-open /
 * data-review-open on the root. Returns null when the host is not mounted.
 */
export function readDisclosureOpen(host: Element | null): boolean | null {
  if (!host) {
    return null;
  }
  const trigger = host.closest(TRIGGER_SELECTOR);
  if (!trigger) {
    return null;
  }

  const aria = trigger.getAttribute("aria-expanded");
  if (aria === "true") {
    return true;
  }

  const details = trigger.closest("details");
  if (details instanceof HTMLDetailsElement) {
    const reviewOpen = details.getAttribute("data-review-open");
    if (reviewOpen === "true") {
      return true;
    }
    if (reviewOpen === "false") {
      return false;
    }
    return details.open;
  }

  const root = trigger.closest(ROOT_SELECTOR);
  if (root) {
    if (root.getAttribute("data-review-open") === "true") {
      return true;
    }
    if (root.getAttribute("data-review-open") === "false") {
      return false;
    }
    if (root.getAttribute("data-open") === "false") {
      return false;
    }
    if (root.hasAttribute("data-open") || flagTrue(root.getAttribute("data-open"))) {
      return true;
    }
  }

  if (aria === "false") {
    return false;
  }
  return false;
}

/**
 * ChevronDown ↔ ChevronUp via Morphicons. Used on accordion / score-module
 * disclosures and shell account-menu triggers (top-nav follow-on to #117).
 *
 * First paint reads the live SoT (controlled `open`, disclosure context,
 * details.open / aria-expanded). MorphIcon mounts only after that seed so a
 * default-open module does not flash ChevronDown or morph on mount.
 */
export function DisclosureMorphChevron({
  open,
  className,
  "data-slot": dataSlot = "disclosure-morph-chevron",
  "data-icon": dataIcon
}: DisclosureMorphChevronProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const contextOpen = useContext(DisclosureOpenContext);
  const controlledOpen = open ?? contextOpen;
  const [observedOpen, setObservedOpen] = useState<boolean | null>(null);
  const seeded = controlledOpen !== undefined || observedOpen !== null;
  const resolvedOpen = controlledOpen ?? observedOpen ?? false;

  useLayoutEffect(() => {
    if (controlledOpen !== undefined) {
      return;
    }
    const host = hostRef.current;
    if (!host) {
      return;
    }
    const trigger = host.closest(TRIGGER_SELECTOR);
    if (!trigger) {
      setObservedOpen(false);
      return;
    }

    const sync = () => {
      setObservedOpen(readDisclosureOpen(host) ?? false);
    };
    sync();

    const observer = new MutationObserver(sync);
    observer.observe(trigger, {
      attributes: true,
      attributeFilter: ["aria-expanded", "data-open"]
    });
    const root = trigger.closest(ROOT_SELECTOR);
    if (root && root !== trigger) {
      observer.observe(root, {
        attributes: true,
        attributeFilter: ["data-open", "data-review-open", "open"]
      });
    }
    return () => observer.disconnect();
  }, [controlledOpen]);

  return (
    <span
      ref={hostRef}
      data-slot={dataSlot}
      data-disclosure-open={seeded ? (resolvedOpen ? "true" : "false") : "pending"}
      className={cn("inline-flex shrink-0", className)}
      aria-hidden="true"
    >
      {seeded ? (
        <MorphIcon icon={resolvedOpen ? ChevronUp : ChevronDown} data-icon={dataIcon} />
      ) : null}
    </span>
  );
}
