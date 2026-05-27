"use client";

import { ArrowRight, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import styles from "./coach-callout.module.css";

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
  const classNames = [styles.callout, className].filter(Boolean).join(" ");

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
    <aside
      className={classNames}
      data-tone={tone}
      data-variant={variant}
      data-placement={placement}
      data-dismissible={dismissId ? "true" : undefined}
      role="region"
      aria-label={title}
    >
      {anchorLabel ? (
        <span className={styles.anchor} aria-label={anchorLabel} role="img">
          <span aria-hidden="true" />
        </span>
      ) : null}
      {dismissId ? (
        <button type="button" className={styles.dismiss} onClick={dismiss} aria-label={dismissLabel}>
          <X size={14} aria-hidden="true" />
        </button>
      ) : null}
      <div className={styles.content}>
        <div className={styles.header}>
          {stepIndex ? (
            <span className={styles.step} data-step-index={stepIndex} aria-hidden="true">
              {stepIndex}
            </span>
          ) : null}
          <strong className={styles.title}>{title}</strong>
        </div>
        <div className={styles.body}>{body}</div>
        {href && actionLabel ? (
          <Link className={styles.action} href={href}>
            <span>{actionLabel}</span>
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
