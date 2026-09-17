"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DAY1_TOUR_DISMISS_STORAGE_KEY,
  isDay1TourDismissed,
  welcomeBackWouldShowFromStorage
} from "@/lib/guidance/visit-memory";
import { cn } from "@/lib/utils";

type QueueDay1TourProps = {
  className?: string;
};

const DAY1_GLOSSARY_LINE = "контрольный срок проверки и типичный helpdesk-источник.";

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
 * Day-1 SLA/OTRS glossary — one compact info row (icon + text + dismiss).
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
    <Alert
      role="region"
      aria-label="Подсказки очереди"
      data-slot="queue-day1-glossary"
      className={cn(
        "has-[>svg]:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 py-1.5 *:[svg]:row-span-1 *:[svg]:translate-y-0 has-data-[slot=alert-action]:pr-2",
        className
      )}
    >
      <Info aria-hidden="true" />
      <AlertDescription className="text-xs leading-snug">
        <span className="font-medium text-foreground">SLA и OTRS</span>
        {" — "}
        {DAY1_GLOSSARY_LINE}
      </AlertDescription>
      <AlertAction className="static inset-auto">
        <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Скрыть подсказки">
          <X aria-hidden="true" />
        </Button>
      </AlertAction>
    </Alert>
  );
}
