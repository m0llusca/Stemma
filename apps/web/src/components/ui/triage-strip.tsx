import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type TriageStripTone = "accent" | "success" | "warning" | "danger" | "ai";

const toneClass: Record<TriageStripTone, string> = {
  accent: "border-primary/30 bg-primary/5",
  success: "border-success/30 bg-success-soft",
  warning: "border-warning/30 bg-warning-soft",
  danger: "border-destructive/30 bg-destructive-soft",
  ai: "border-primary/30 bg-primary/5"
};

/**
 * Decision banner composed from shadcn Alert.
 */
export function TriageStrip({
  icon,
  title,
  description,
  action,
  tone = "accent",
  className
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: TriageStripTone;
  className?: string;
}) {
  return (
    <Alert
      data-slot="triage-strip"
      className={cn(
        "flex flex-col items-stretch gap-3 min-[390px]:flex-row min-[390px]:items-center [&>svg]:static",
        toneClass[tone],
        className
      )}
    >
      {icon}
      <div data-slot="triage-strip-copy" className="flex min-w-0 flex-1 flex-col gap-1">
        <AlertTitle className="mb-0">{title}</AlertTitle>
        {description != null ? <AlertDescription>{description}</AlertDescription> : null}
      </div>
      {action != null ? (
        <div
          data-slot="triage-strip-action"
          className="w-full min-[390px]:w-auto min-[390px]:shrink-0 [&_[data-slot=button]]:w-full min-[390px]:[&_[data-slot=button]]:w-auto"
        >
          {action}
        </div>
      ) : null}
    </Alert>
  );
}
