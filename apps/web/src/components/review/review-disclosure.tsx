"use client";

import { useState, type ComponentProps } from "react";
import { Collapsible } from "@/components/ui/collapsible";

/**
 * Session memory for review disclosures. Uncontrolled `defaultOpen` resets
 * whenever the RSC slot remounts (LIVE save / revalidatePath / action commit).
 * Controlled `open` + this map is the single source of truth after first paint.
 */
const reviewDisclosureMemory = new Map<string, boolean>();

export function resetReviewDisclosureMemory() {
  reviewDisclosureMemory.clear();
}

type ReviewDisclosureProps = ComponentProps<typeof Collapsible> & {
  /** Stable id for this ticket + disclosure (survives remount). */
  memoryKey: string;
};

export function ReviewDisclosure({
  memoryKey,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ReviewDisclosureProps) {
  const [open, setOpen] = useState(() => reviewDisclosureMemory.get(memoryKey) ?? defaultOpen);

  return (
    <Collapsible
      {...props}
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        reviewDisclosureMemory.set(memoryKey, nextOpen);
        setOpen(nextOpen);
        onOpenChange?.(nextOpen, eventDetails);
      }}
    />
  );
}
