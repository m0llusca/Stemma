"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CoachCalloutTone = "neutral" | "info" | "success" | "warning";
export type CoachCalloutPlacement = "top" | "right" | "bottom" | "left";
export type CoachCalloutVariant = "soft" | "spotlight";

type CoachCalloutProps = {
  title: string;
  body: ReactNode;
  href?: string;
  actionLabel?: string;
  tone?: CoachCalloutTone;
  variant?: CoachCalloutVariant;
  placement?: CoachCalloutPlacement;
  anchorLabel?: string;
  stepIndex?: number;
  dismissId?: string;
  dismissLabel?: string;
  className?: string;
};

function dismissStorageKey(dismissId: string) {
  return `qc:coach-callout:${dismissId}`;
}

const toneClass: Record<CoachCalloutTone, string> = {
  neutral: "border-border bg-card text-card-foreground",
  info: "border-primary/30 bg-primary/5 text-foreground",
  success: "border-emerald-500/30 bg-emerald-500/10 text-foreground",
  warning: "border-amber-500/30 bg-amber-500/10 text-foreground"
};

const placementAnchorClass: Record<CoachCalloutPlacement, string> = {
  top: "top-0 left-4 -translate-y-1/2",
  right: "top-3 right-0 translate-x-1/2",
  bottom: "bottom-0 left-4 translate-y-1/2",
  left: "top-3 left-0 -translate-x-1/2"
};

export function CoachCallout({
  title,
  body,
  href,
  actionLabel,
  tone = "neutral",
  variant = "soft",
  placement = "right",
  anchorLabel,
  stepIndex,
  dismissId,
  dismissLabel = "Скрыть подсказку",
  className
}: CoachCalloutProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!dismissId) {
      setIsDismissed(false);
      return;
    }

    try {
      setIsDismissed(window.localStorage.getItem(dismissStorageKey(dismissId)) === "1");
    } catch {
      setIsDismissed(false);
    }
  }, [dismissId]);

  if (isDismissed) {
    return null;
  }

  const dismiss = () => {
    if (dismissId) {
      try {
        window.localStorage.setItem(dismissStorageKey(dismissId), "1");
      } catch {
        // The hint should still close if localStorage is unavailable.
      }
    }

    setIsDismissed(true);
  };

  return (
    <Alert
      role="region"
      aria-label={title}
      data-tone={tone}
      data-variant={variant}
      data-placement={placement}
      data-dismissible={dismissId ? "true" : undefined}
      className={cn(
        "relative min-w-0 gap-2",
        toneClass[tone],
        variant === "spotlight" && "shadow-md",
        dismissId && "pr-12",
        className
      )}
    >
      {anchorLabel ? (
        <span
          className={cn(
            "absolute z-10 inline-flex size-[18px] items-center justify-center rounded-full border border-primary/40 bg-background shadow-sm",
            variant === "spotlight" && "size-6 shadow-[0_0_0_6px_color-mix(in_oklch,var(--primary)_18%,transparent)]",
            placementAnchorClass[placement]
          )}
          aria-label={anchorLabel}
          role="img"
        >
          <span
            className={cn("block size-1.5 rounded-full bg-primary", variant === "spotlight" && "size-2.5")}
            aria-hidden="true"
          />
        </span>
      ) : null}

      {dismissId ? (
        <AlertAction>
          <Button type="button" variant="ghost" size="icon-xs" onClick={dismiss} aria-label={dismissLabel}>
            <X aria-hidden="true" />
          </Button>
        </AlertAction>
      ) : null}

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {stepIndex ? (
            <span
              className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-[11px] font-semibold text-primary"
              data-step-index={stepIndex}
              aria-hidden="true"
            >
              {stepIndex}
            </span>
          ) : null}
          <AlertTitle className={cn("mb-0", variant === "spotlight" ? "text-base" : "text-sm")}>{title}</AlertTitle>
        </div>
        <AlertDescription className={cn(variant === "spotlight" && "max-w-[34ch] text-sm")}>{body}</AlertDescription>
        {href && actionLabel ? (
          <Link
            href={href}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "w-fit gap-1.5 text-primary"
            )}
          >
            <span>{actionLabel}</span>
            <ArrowRight data-icon="inline-end" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </Alert>
  );
}
