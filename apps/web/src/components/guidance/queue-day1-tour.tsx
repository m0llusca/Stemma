"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { QUEUE_GLOSSARY } from "@/components/guidance/queue-glossary";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import {
  DAY1_TOUR_DISMISS_STORAGE_KEY,
  isDay1TourDismissed,
  welcomeBackWouldShowFromStorage
} from "@/lib/guidance/visit-memory";
import { cn } from "@/lib/utils";

type QueueDay1TourProps = {
  className?: string;
};

const DAY1_GLOSSARY_LINE = "SLA — контрольный срок проверки. OTRS — типичный helpdesk-источник.";

function readDismissed(): boolean {
  try {
    return isDay1TourDismissed(window.localStorage.getItem(DAY1_TOUR_DISMISS_STORAGE_KEY));
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    window.localStorage.setItem(DAY1_TOUR_DISMISS_STORAGE_KEY, "1");
  } catch {
    // Still hide for this session.
  }
}

/**
 * Day-1 SLA/OTRS glossary — one compact dismissible chip, not a fat banner.
 * After dismiss, later visits keep the filters `sr-only` helper only.
 * Skipped while welcome-back is eligible so returners are not double-nudged.
 */
export function QueueDay1Tour({ className }: QueueDay1TourProps) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const alreadyDismissed = readDismissed();
    const skipForWelcomeBack = welcomeBackWouldShowFromStorage();
    setDismissed(alreadyDismissed || skipForWelcomeBack);
    setReady(true);
  }, []);

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
  };

  if (!ready || dismissed) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Подсказки очереди"
      data-slot="queue-day1-glossary"
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-2 py-1 text-xs text-card-foreground",
        className
      )}
    >
      <Chip size="xs" tone="neutral">
        SLA и OTRS
      </Chip>
      <p className="min-w-0 flex-1 text-pretty text-muted-foreground" title={DAY1_GLOSSARY_LINE}>
        {DAY1_GLOSSARY_LINE}
      </p>
      <p className="sr-only">
        {QUEUE_GLOSSARY.sla.content} {QUEUE_GLOSSARY.otrs.content}
      </p>
      <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Скрыть подсказки">
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
