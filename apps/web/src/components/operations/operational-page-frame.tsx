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
  signals?: ReactNode;
  action: ReactNode;
  details: ReactNode;
  evidence?: ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("operational-page-frame", className)} aria-label={title}>
      {signals ? <div className="operational-page-frame__signals">{signals}</div> : null}
      <div className="operational-page-frame__action">{action}</div>
      <div className="operational-page-frame__details">{details}</div>
      {evidence ? <div className="operational-page-frame__evidence">{evidence}</div> : null}
    </section>
  );
}
