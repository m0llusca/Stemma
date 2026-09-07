"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  LAST_VISIT_STORAGE_KEY,
  parseLastVisit,
  shouldShowWelcomeBack,
  welcomeBackTrapCopy,
  type QueueFilterTrap
} from "@/lib/guidance/visit-memory";
import { cn } from "@/lib/utils";

export const WELCOME_BACK_RESET_LABEL = "Сбросить к очереди дня";

type WelcomeBackBannerProps = {
  className?: string;
  /** When true, skip touching lastVisit on mount (tests). */
  deferTouch?: boolean;
  /**
   * Surface-specific role-home reset (`welcomeBackResetHref`). Reviews: Analyst
   * mine+overdue / other queue roles `/reviews`. Dashboard: `roleHomePath`.
   */
  resetHref: string;
  /** Off-role-home filters — named saved view or honest ad-hoc copy. */
  trap?: QueueFilterTrap;
};

function readLastVisit(): Date | null {
  try {
    return parseLastVisit(window.localStorage.getItem(LAST_VISIT_STORAGE_KEY));
  } catch {
    return null;
  }
}

function writeLastVisit(now: Date) {
  try {
    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, now.toISOString());
  } catch {
    // Banner dismiss still works in-memory if storage is blocked.
  }
}

/**
 * Gentle banner after ~30 days away. Does not block Take next —
 * sits as a dismissible alert with a role-home filter-reset CTA.
 */
export function WelcomeBackBanner({
  className,
  deferTouch = false,
  resetHref,
  trap
}: WelcomeBackBannerProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const now = new Date();
    const lastVisit = readLastVisit();
    const show = shouldShowWelcomeBack(now, lastVisit);

    setVisible(show);

    if (!show && !deferTouch) {
      writeLastVisit(now);
    }
  }, [deferTouch]);

  const dismiss = () => {
    writeLastVisit(new Date());
    setVisible(false);
  };

  if (!visible) {
    return null;
  }

  return (
    <Alert
      role="region"
      aria-label="С возвращением"
      data-slot="welcome-back-banner"
      data-trap-kind={trap?.kind}
      className={cn("border-primary/30 bg-primary/5 text-foreground", className)}
    >
      <AlertAction>
        <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label="Скрыть напоминание">
          <X aria-hidden="true" />
        </Button>
      </AlertAction>
      <AlertTitle className="mb-0 text-sm">С возвращением</AlertTitle>
      <AlertDescription>{welcomeBackTrapCopy(trap)}</AlertDescription>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href={resetHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          onClick={dismiss}
        >
          {WELCOME_BACK_RESET_LABEL}
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss}>
          Оставить как есть
        </Button>
      </div>
    </Alert>
  );
}
