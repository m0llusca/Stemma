import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";

export type CertificationEvidenceListItem = {
  id: string;
  runId: string;
  result: string;
  envGate: string;
  recordedAt: Date | string;
  actor?: { name: string | null; email: string | null } | null;
};

function evidenceDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;

  return Number.isNaN(date.getTime()) ? "Нет данных" : date.toLocaleString("ru-RU");
}

function evidenceResultLabel(value: string) {
  const labels: Record<string, string> = {
    blocked: "Заблокировано",
    failed: "Ошибка",
    passed: "Пройдено",
    skipped: "Пропущено"
  };

  return labels[value] ?? value;
}

export function CertificationEvidenceList({
  evidence,
  emptyText = "Evidence по этому источнику пока не записан."
}: {
  evidence: CertificationEvidenceListItem[];
  emptyText?: string;
}) {
  if (evidence.length === 0) {
    return <p className="record-meta">{emptyText}</p>;
  }

  return (
    <div className="grid min-w-0 gap-2">
      {evidence.map((item) => (
        <div key={item.id} className="admin-tile admin-tile--compact">
          <span className="admin-tile__icon admin-tile__icon--plain">E</span>
          <span className="admin-tile__body">
            <span className="record-title record-title--tight">{evidenceResultLabel(item.result)}</span>
            <span className="record-meta compact-text">
              {evidenceDate(item.recordedAt)} · run {item.runId.slice(0, 8)}
            </span>
            <span className="record-meta compact-text">
              {item.envGate} · {item.actor?.name ?? item.actor?.email ?? "актор не указан"}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0">
      {eyebrow ? <p className="text-xs font-semibold uppercase text-[var(--text-muted)]">{eyebrow}</p> : null}
      <h3 className={`${eyebrow ? "mt-1 " : ""}text-sm font-semibold text-[var(--foreground)]`}>{title}</h3>
      {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-[var(--text-muted)] compact-text">{description}</p> : null}
    </div>
  );
}

export function Surface({
  title,
  description,
  children,
  className = "",
  bodyClassName = "p-4"
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`panel min-w-0 overflow-clip ${className}`}>
      {title ? (
        <div className="border-b border-[var(--border)] px-5 py-4">
          <SectionHeader title={title} description={description} />
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

export function DataTable({
  title,
  description,
  minWidth = "min-w-[720px]",
  children,
  className = ""
}: {
  title?: string;
  description?: string;
  minWidth?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface title={title} description={description} bodyClassName="p-0" className={className}>
      <div className="scroll-area scroll-area--responsive-table">
        <table className={`table-fixed-copy w-full ${minWidth} border-collapse text-left text-sm`}>{children}</table>
      </div>
    </Surface>
  );
}

export function CodeBlock({ children, maxHeight = "max-h-[320px]" }: { children: string; maxHeight?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex justify-end">
        <CopyButton value={children} />
      </div>
      <pre className={`code-surface ${maxHeight} overflow-auto rounded-md p-4 text-xs leading-5`}>
        <code>{children}</code>
      </pre>
    </div>
  );
}

export function CodeExampleCard({
  title,
  description,
  children,
  maxHeight,
  className = ""
}: {
  title: string;
  description?: string;
  children: string;
  maxHeight?: string;
  className?: string;
}) {
  return (
    <Surface title={title} description={description} className={className}>
      <CodeBlock maxHeight={maxHeight}>{children}</CodeBlock>
    </Surface>
  );
}
