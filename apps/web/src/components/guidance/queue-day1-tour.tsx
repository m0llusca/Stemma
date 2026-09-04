"use client";

import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";

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

const TOUR_STEPS = [
  {
    title: "Взять следующий",
    body: "Кнопка «Взять следующий» открывает первый кейс по текущим фильтрам и SLA — основной рабочий жест очереди."
  },
  {
    title: "На что смотреть",
    body: "Сначала срок (SLA) и риск, затем источник и канал. Точные фильтры — в боковой панели, чтобы не забивать inbox."
  },
  {
    title: "Статус проверки",
    body: "«Статус проверки» — единый источник правды по кейсу (в очереди / в работе / завершено). Итог в фильтре — отдельный срез."
  }
] as const;

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
 * Optional 3-step day-1 tour. Dismissible once; never blocks Take next.
 * Skipped while welcome-back is eligible so returners are not double-nudged.
 */
export function QueueDay1Tour({ className }: QueueDay1TourProps) {
  const [ready, setReady] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
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

  const step = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const isLast = stepIndex >= TOUR_STEPS.length - 1;

  return (
    <Alert
      role="region"
      aria-label={`Обзор очереди, шаг ${stepIndex + 1} из ${TOUR_STEPS.length}`}
      data-slot="queue-day1-tour"
      data-step={stepIndex + 1}
      className={cn("border-border bg-card text-card-foreground", className)}
    >
      <AlertAction>
        <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Пропустить обзор">
          <X aria-hidden="true" />
        </Button>
      </AlertAction>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary"
            aria-hidden="true"
          >
            {stepIndex + 1}
          </span>
          <AlertTitle className="mb-0 text-sm">{step.title}</AlertTitle>
        </div>
        <AlertDescription>{step.body}</AlertDescription>
        <div className="flex flex-wrap items-center gap-2">
          {isLast ? (
            <Button type="button" size="sm" onClick={dismiss}>
              Понятно
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setStepIndex((current) => Math.min(current + 1, TOUR_STEPS.length - 1))}
            >
              Далее
              <ArrowRight data-icon="inline-end" aria-hidden="true" />
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
            Пропустить
          </Button>
        </div>
      </div>
    </Alert>
  );
}
