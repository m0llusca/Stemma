import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type CertificationEvidenceListItem = {
  id: string;
  runId: string;
  result: string;
  envGate: string;
  recordedAt: Date | string;
  actor?: { name: string | null; email: string | null } | null;
};

export function IntegrationFact({
  label,
  children,
  technical = false,
  className
}: {
  label: string;
  children: ReactNode;
  technical?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 border-b border-border py-2 last:border-b-0",
        className
      )}
    >
      <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">{label}</span>
      <div
        className={cn(
          "min-w-0 text-sm text-foreground",
          technical ? "[overflow-wrap:anywhere]" : "break-words"
        )}
        data-technical={technical ? "true" : undefined}
      >
        {children}
      </div>
    </div>
  );
}

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
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div className="grid min-w-0 gap-2">
      {evidence.map((item) => (
        <div
          key={item.id}
          className="flex min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3"
        >
          <span
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground"
            aria-hidden="true"
          >
            E
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="text-sm font-semibold text-foreground">{evidenceResultLabel(item.result)}</span>
            <span className="text-xs text-muted-foreground">
              {evidenceDate(item.recordedAt)} · run {item.runId.slice(0, 8)}
            </span>
            <span className="text-xs text-muted-foreground">
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
    <div className="grid min-w-0 gap-1">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>
      ) : null}
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
    <Card className={cn("min-w-0 overflow-clip py-0", className)}>
      {title ? (
        <CardHeader className="border-b border-border py-4">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(bodyClassName)}>{children}</CardContent>
    </Card>
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
      <Table className={cn("text-left", minWidth)}>{children}</Table>
    </Surface>
  );
}

export function CodeBlock({ children, maxHeight = "max-h-[320px]" }: { children: string; maxHeight?: string }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex justify-end">
        <CopyButton value={children} />
      </div>
      <pre
        className={cn(
          "overflow-auto rounded-md border border-border bg-muted/40 p-4 text-xs leading-5",
          maxHeight
        )}
      >
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
