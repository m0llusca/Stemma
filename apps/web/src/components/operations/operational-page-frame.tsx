import clsx from "clsx";
import type { ReactNode } from "react";

export function OperationalPageFrame({
  title,
  signals,
  action,
  details,
  evidence,
  className
}: {
  title: string;
  signals: ReactNode;
  action: ReactNode;
  details: ReactNode;
  evidence: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("operational-page-frame", className)} aria-labelledby="operational-page-title">
      <h1 id="operational-page-title" className="sr-only">
        {title}
      </h1>
      <div className="operational-page-frame__signals">{signals}</div>
      <div className="operational-page-frame__action">{action}</div>
      <div className="operational-page-frame__details">{details}</div>
      <div className="operational-page-frame__evidence">{evidence}</div>
    </section>
  );
}
