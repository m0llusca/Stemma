"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Columns3, Grid2x2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import { cn } from "@/lib/utils";

/**
 * Reusable agent × criteria matrix.
 *
 * Decision-first grammar:
 * - sticky first column so the name never scrolls away;
 * - pinned "Среднее по команде" row as the reference line;
 * - single-hue indigo tint ramp for cell background (denser = lower pass-rate);
 * - inline micro-bar inside every pass-rate cell;
 * - column picker to hide/show criteria columns.
 */

export type CriterionMatrixColumn = {
  /** Stable key for the column (criterion block id / label). */
  key: string;
  /** Short label rendered in the small-caps header. */
  label: string;
};

export type CriterionMatrixCell = {
  /** Pass-rate / normalized score 0-100, or null when not evaluated. */
  value: number | null;
  /** Number of evaluations behind the cell (for the title/tooltip). */
  count?: number;
  href?: string;
};

export type CriterionMatrixRow = {
  key: string;
  label: string;
  /** Secondary line under the label, e.g. review count. */
  meta?: string;
  href?: string;
  /** Cell per column key. Missing keys render as an empty cell. */
  cells: Record<string, CriterionMatrixCell>;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

/** Single-hue intensity bucket: lower score => denser ink fill. */
function intensityClass(value: number | null) {
  if (value == null) {
    return "bg-muted/40 text-muted-foreground";
  }

  const score = clampPercent(value);

  if (score >= 90) {
    return "bg-primary/10 text-foreground";
  }

  if (score >= 80) {
    return "bg-primary/20 text-foreground";
  }

  if (score >= 70) {
    return "bg-primary/35 text-foreground";
  }

  return "bg-primary text-primary-foreground";
}

function formatScore(value: number | null) {
  return value == null ? "—" : String(Math.round(value));
}

function CellBody({ cell }: { cell: CriterionMatrixCell }) {
  const score = cell.value;
  const title =
    score == null
      ? "Нет оценок"
      : `${Math.round(score)}${cell.count != null ? ` · ${cell.count}` : ""}`;

  return (
    <span className="flex min-w-[3.25rem] flex-col items-center gap-1 px-1 py-1.5" title={title}>
      <span className="text-xs font-semibold tabular-nums">{formatScore(score)}</span>
      <span className="h-1 w-full overflow-hidden rounded-full bg-background/40" aria-hidden="true">
        <span
          className="block h-full rounded-full bg-current opacity-80"
          style={{ width: `${score == null ? 0 : clampPercent(score)}%` }}
        />
      </span>
    </span>
  );
}

function MatrixCell({ cell }: { cell: CriterionMatrixCell }) {
  const bodyClass = cn(
    "flex items-center justify-center rounded-md",
    intensityClass(cell.value),
    cell.href && cell.value != null && "transition-opacity hover:opacity-90"
  );

  if (cell.href && cell.value != null) {
    return (
      <TableCell className="p-1">
        <Link
          href={cell.href}
          {...reportPageLocalLinkProps(cell.href)}
          className={bodyClass}
        >
          <CellBody cell={cell} />
        </Link>
      </TableCell>
    );
  }

  return (
    <TableCell className="p-1">
      <div className={bodyClass}>
        <CellBody cell={cell} />
      </div>
    </TableCell>
  );
}

export function CriterionMatrix({
  columns,
  rows,
  teamAverage,
  rowHeaderLabel = "Оператор",
  scrollRegionLabelledBy,
  emptyTitle = "Нет данных для матрицы",
  emptyDescription = "Матрица появится после первых завершенных проверок с оценками по критериям."
}: {
  columns: CriterionMatrixColumn[];
  rows: CriterionMatrixRow[];
  /** Pinned reference row (team average), keyed like a normal row's cells. */
  teamAverage?: {
    label?: string;
    meta?: string;
    cells: Record<string, CriterionMatrixCell>;
  };
  rowHeaderLabel?: string;
  scrollRegionLabelledBy?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const visibleColumns = useMemo(
    () => columns.filter((column) => !hidden.has(column.key)),
    [columns, hidden]
  );

  function toggleColumn(key: string) {
    setHidden((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  if (columns.length === 0 || rows.length === 0) {
    return (
      <EmptyState
        icon={<Grid2x2 size={22} aria-hidden="true" />}
        title={emptyTitle}
        description={emptyDescription}
        size="inline"
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Columns3 size={14} aria-hidden="true" />
          Колонки
        </span>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Видимые критерии">
          {columns.map((column) => {
            const isVisible = !hidden.has(column.key);

            return (
              <Button
                key={column.key}
                type="button"
                size="xs"
                variant={isVisible ? "secondary" : "outline"}
                aria-pressed={isVisible}
                onClick={() => toggleColumn(column.key)}
                className={cn(!isVisible && "opacity-60")}
              >
                {column.label}
              </Button>
            );
          })}
        </div>
        <Badge variant="secondary" className="ml-auto tabular-nums">
          {visibleColumns.length}/{columns.length}
        </Badge>
      </div>

      <div
        role="region"
        aria-label={
          scrollRegionLabelledBy ? undefined : "Матрица критериев"
        }
        aria-labelledby={scrollRegionLabelledBy}
        tabIndex={0}
        data-slot="criterion-matrix-scroll-region"
        className="min-w-0 overflow-x-auto rounded-lg ring-1 ring-border outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=table-container]]:overflow-visible"
      >
        <Table className="min-w-max">
          <TableHeader className="sticky top-0 z-20 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead
                scope="col"
                className="sticky left-0 z-30 min-w-[8rem] bg-card text-xs font-semibold uppercase tracking-wide"
              >
                {rowHeaderLabel}
              </TableHead>
              {visibleColumns.map((column) => (
                <TableHead
                  key={column.key}
                  scope="col"
                  className="min-w-[4rem] bg-card text-center text-[11px] font-semibold uppercase tracking-wide"
                >
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teamAverage ? (
              <TableRow className="bg-muted/40 hover:bg-muted/50">
                <TableHead
                  scope="row"
                  className="sticky left-0 z-10 bg-muted font-medium text-foreground"
                >
                  <span className="block text-sm">{teamAverage.label ?? "Среднее по команде"}</span>
                  {teamAverage.meta ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {teamAverage.meta}
                    </span>
                  ) : null}
                </TableHead>
                {visibleColumns.map((column) => (
                  <MatrixCell
                    key={column.key}
                    cell={teamAverage.cells[column.key] ?? { value: null }}
                  />
                ))}
              </TableRow>
            ) : null}
            {rows.map((row) => {
              const labelContent = (
                <>
                  <span className="block text-sm font-medium text-foreground">{row.label}</span>
                  {row.meta ? (
                    <span className="block text-xs font-normal text-muted-foreground">{row.meta}</span>
                  ) : null}
                </>
              );

              return (
                <TableRow key={row.key}>
                  <TableHead
                    scope="row"
                    className="sticky left-0 z-10 bg-card font-medium text-foreground"
                  >
                    {row.href ? (
                      <Link
                        href={row.href}
                        {...reportPageLocalLinkProps(row.href)}
                        className="block rounded-sm outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {labelContent}
                      </Link>
                    ) : (
                      labelContent
                    )}
                  </TableHead>
                  {visibleColumns.map((column) => (
                    <MatrixCell key={column.key} cell={row.cells[column.key] ?? { value: null }} />
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
