import type * as React from "react";
import { QueueCommandBarState } from "@/components/review/queue-command-bar-state";
import { PageShell } from "@/components/ui/page-shell";

export type QueueWorkspaceProps = Readonly<{
  description: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}>;

export type QueueWorkspaceKpisProps = {
  "aria-label": string;
  children: React.ReactNode;
};

export type QueueWorkspaceCommandBarProps = {
  "aria-label": string;
  children: React.ReactNode;
  expandedOnly?: React.ReactNode;
  stuckOnly?: React.ReactNode;
};

export type QueueWorkspaceMainProps = {
  "aria-label": string;
  children: React.ReactNode;
  preview?: React.ReactNode;
  previewLabel?: string;
};

function QueueWorkspaceRoot({
  description,
  actions,
  children
}: QueueWorkspaceProps) {
  return (
    <PageShell
      eyebrow="Контроль качества"
      title="Очередь проверок"
      description={description}
      actions={actions}
    >
      <div
        data-slot="review-queue-workspace"
        className="flex min-w-0 flex-col gap-(--section-gap)"
      >
        {children}
      </div>
    </PageShell>
  );
}

function QueueWorkspaceKpis({
  "aria-label": ariaLabel,
  children
}: QueueWorkspaceKpisProps) {
  return (
    <section
      data-slot="review-queue-kpis"
      className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}

function QueueWorkspaceCommandBar({
  "aria-label": ariaLabel,
  children,
  expandedOnly,
  stuckOnly
}: QueueWorkspaceCommandBarProps) {
  return (
    <QueueCommandBarState
      ariaLabel={ariaLabel}
      expandedOnly={expandedOnly}
      stuckOnly={stuckOnly}
    >
      {children}
    </QueueCommandBarState>
  );
}

function QueueWorkspaceMain({
  "aria-label": ariaLabel,
  children,
  preview,
  previewLabel
}: QueueWorkspaceMainProps) {
  return (
    <section
      className="flex min-w-0 flex-col gap-(--section-gap)"
      aria-label={ariaLabel}
    >
      {preview != null ? (
        <aside
          data-slot="review-queue-preview"
          className="min-w-0"
          aria-label={previewLabel}
        >
          {preview}
        </aside>
      ) : null}
      <div data-slot="review-queue-list" className="min-w-0">
        {children}
      </div>
    </section>
  );
}

export const QueueWorkspace = Object.assign(QueueWorkspaceRoot, {
  Kpis: QueueWorkspaceKpis,
  CommandBar: QueueWorkspaceCommandBar,
  Main: QueueWorkspaceMain
});
