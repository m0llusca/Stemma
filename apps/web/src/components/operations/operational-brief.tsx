import clsx from "clsx";
import type { ReactNode } from "react";
import type { StatusTone } from "@/lib/ui/status-tone";

export type OperationalBriefItem = {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone?: StatusTone;
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
    <section className={clsx("operational-brief", className)}>
      <div className="operational-brief__lead">
        <p className="page-kicker">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="operational-brief__items">
        {items.map((item) => (
          <div key={item.label} className={clsx("operational-brief-item", item.tone ? `status-tone--${item.tone}` : undefined)}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export type OperationalStepState = "ready" | "active" | "waiting" | "blocked";

export type OperationalStep = {
  label: string;
  detail: ReactNode;
  state: OperationalStepState;
};

export function OperationalStepRail({
  steps,
  ariaLabel
}: {
  steps: OperationalStep[];
  ariaLabel: string;
}) {
  return (
    <div className="operational-step-rail" aria-label={ariaLabel}>
      {steps.map((step) => (
        <div key={step.label} className={`operational-step operational-step--${step.state}`}>
          <span>{step.label}</span>
          <small>{step.detail}</small>
        </div>
      ))}
    </div>
  );
}
