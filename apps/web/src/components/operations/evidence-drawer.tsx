import type { ReactNode } from "react";

export function EvidenceDrawer({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="evidence-drawer" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="evidence-drawer__body">{children}</div>
    </details>
  );
}
