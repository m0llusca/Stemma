"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { QUEUE_GLOSSARY } from "@/components/guidance/queue-glossary";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DAY1_TOUR_DISMISS_STORAGE_KEY,
  LAST_VISIT_STORAGE_KEY,
  isDay1TourDismissed,
  parseLastVisit,
  shouldShowWelcomeBack
} from "@/lib/guidance/visit-memory";
import { cn } from "@/lib/utils";

type QueueDay1TourProps = {
  className?: string;
};

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

function welcomeBackWouldShow(): boolean {
  try {
    const lastVisit = parseLastVisit(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY));
    return shouldShowWelcomeBack(new Date(), lastVisit);
  } catch {
    return false;
  }
}

/**
 * Day-1 SLA/OTRS glossary — one dismissible hint, not a stepped tour.
 * Skipped while welcome-back is eligible so returners are not double-nudged.
 */
export function QueueDay1Tour({ className }: QueueDay1TourProps) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const alreadyDismissed = readDismissed();
    const skipForWelcomeBack = welcomeBackWouldShow();
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
    <Alert
      role="region"
      aria-label="Подсказки очереди"
      data-slot="queue-day1-glossary"
      className={cn("border-border bg-card text-card-foreground", className)}
    >
      <AlertAction>
        <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Скрыть подсказки">
          <X aria-hidden="true" />
        </Button>
      </AlertAction>
      <div className="flex min-w-0 flex-col gap-2">
        <AlertTitle className="mb-0 text-sm">SLA и OTRS</AlertTitle>
        <AlertDescription>
          <span className="block">{QUEUE_GLOSSARY.sla.content}</span>
          <span className="mt-1 block">{QUEUE_GLOSSARY.otrs.content}</span>
        </AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={dismiss}>
            Понятно
          </Button>
        </div>
      </div>
    </Alert>
  );
}
