import type { ReactNode } from "react";

export function EvidenceDrawer({
  title,
  description,
  children,
  defaultOpen = false
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="evidence-drawer" open={defaultOpen}>
      <summary>
        <span className="evidence-drawer__summary-copy">
          <span className="evidence-drawer__title">{title}</span>
          {description ? <span className="evidence-drawer__description">{description}</span> : null}
        </span>
      </summary>
      <div className="evidence-drawer__body">{children}</div>
    </details>
  );
}
