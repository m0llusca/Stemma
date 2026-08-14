import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/ui/status-tone";

export type OperationalBriefItem = {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: StatusTone;
};

const itemToneClass: Partial<Record<StatusTone, string>> = {
  positive: "text-emerald-700 dark:text-emerald-300",
  warning: "text-amber-800 dark:text-amber-300",
  negative: "text-destructive",
  info: "text-primary"
};

export function OperationalBrief({
  eyebrow,
  title,
  description,
  items,
  className
}: {
  eyebrow: string;
  title: string;
  description: ReactNode;
  items: OperationalBriefItem[];
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden py-0", className)}>
      <div className="grid min-w-0 gap-0 md:grid-cols-[minmax(230px,0.56fr)_minmax(0,1.44fr)]">
        <Alert className="rounded-none border-0 border-border bg-muted/40 md:border-r">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
          <AlertTitle className="text-base">{title}</AlertTitle>
          <AlertDescription>{description}</AlertDescription>
        </Alert>
        <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-0 p-0">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex min-w-0 flex-col gap-1 border-border p-3.5 not-last:border-b md:not-last:border-b-0 md:not-last:border-r"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {item.label}
              </span>
              <strong className={cn("text-lg font-semibold leading-snug break-words", item.tone ? itemToneClass[item.tone] : undefined)}>
                {item.value}
              </strong>
              <small className="text-xs leading-snug text-muted-foreground">{item.detail}</small>
            </div>
          ))}
        </CardContent>
      </div>
    </Card>
  );
}

export type OperationalStepState = "ready" | "active" | "waiting" | "blocked";

export type OperationalStep = {
  label: string;
  detail: ReactNode;
  state: OperationalStepState;
};

const stepBadgeVariant: Record<OperationalStepState, "secondary" | "default" | "outline" | "destructive"> = {
  ready: "secondary",
  active: "default",
  waiting: "outline",
  blocked: "destructive"
};

const stepStateLabel: Record<OperationalStepState, string> = {
  ready: "Готово",
  active: "Активно",
  waiting: "Ожидание",
  blocked: "Блок"
};

export function OperationalStepRail({
  steps,
  ariaLabel
}: {
  steps: OperationalStep[];
  ariaLabel: string;
}) {
  return (
    <Card size="sm" className="overflow-hidden py-0" aria-label={ariaLabel}>
      <CardContent className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-0 p-0">
        {steps.map((step) => (
          <div
            key={step.label}
            className="flex min-w-0 flex-col gap-1.5 border-border p-3 not-last:border-b md:not-last:border-b-0 md:not-last:border-r"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium leading-snug text-foreground">{step.label}</span>
              <Badge variant={stepBadgeVariant[step.state]} className="shrink-0">
                {stepStateLabel[step.state]}
              </Badge>
            </div>
            <small className="text-xs leading-snug text-muted-foreground">{step.detail}</small>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
