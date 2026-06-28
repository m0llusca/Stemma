"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Columns3, Grid2x2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Reusable agent × criteria matrix.
 *
 * Decision-first grammar (clean product / Linear-style):
 * - sticky first column (the agent / row label) so the name never scrolls away;
 * - a pinned "Среднее по команде" row at the top as the reference line;
 * - small-caps column headers;
 * - a SINGLE-HUE desaturated tint ramp for the cell background (no
 *   green-yellow-red traffic light) — stronger ink = lower pass-rate, so weak
 *   cells read as "darker/denser", not "red";
 * - an inline micro-bar inside every pass-rate cell;
 * - a column picker to hide/show criteria columns.
 *
 * Tokens only (works in light Graphite and dark Night Ops). All styling lives
 * in `src/app/styles/components/92-reports.css` under `.criterion-matrix*`.
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
    return "criterion-matrix__cell--empty";
  }

  const score = clampPercent(value);

  if (score >= 90) {
    return "criterion-matrix__cell--t1";
  }

  if (score >= 80) {
    return "criterion-matrix__cell--t2";
  }

  if (score >= 70) {
    return "criterion-matrix__cell--t3";
  }

  return "criterion-matrix__cell--t4";
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
    <span className="criterion-matrix__cell-inner" title={title}>
      <span className="criterion-matrix__cell-value">{formatScore(score)}</span>
      <span className="criterion-matrix__cell-bar" aria-hidden="true">
        <span style={{ width: `${score == null ? 0 : clampPercent(score)}%` }} />
      </span>
    </span>
  );
}

function MatrixCell({ cell }: { cell: CriterionMatrixCell }) {
  const className = `criterion-matrix__cell ${intensityClass(cell.value)}`;

  if (cell.href && cell.value != null) {
    return (
      <td className="criterion-matrix__td">
        <Link href={cell.href} className={`${className} criterion-matrix__cell--link`}>
          <CellBody cell={cell} />
        </Link>
      </td>
    );
  }

  return (
    <td className="criterion-matrix__td">
      <div className={className}>
        <CellBody cell={cell} />
      </div>
    </td>
  );
}

export function CriterionMatrix({
  columns,
  rows,
  teamAverage,
  rowHeaderLabel = "Оператор",
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
    <div className="criterion-matrix">
      <div className="criterion-matrix__toolbar">
        <span className="criterion-matrix__toolbar-label">
          <Columns3 size={14} aria-hidden="true" />
          Колонки
        </span>
        <div className="criterion-matrix__picker" role="group" aria-label="Видимые критерии">
          {columns.map((column) => {
            const isVisible = !hidden.has(column.key);

            return (
              <button
                key={column.key}
                type="button"
                className={`criterion-matrix__picker-chip ${isVisible ? "criterion-matrix__picker-chip--on" : ""}`}
                aria-pressed={isVisible}
                onClick={() => toggleColumn(column.key)}
              >
                {column.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="criterion-matrix__scroll">
        <table className="criterion-matrix__table">
          <thead>
            <tr>
              <th scope="col" className="criterion-matrix__corner">
                {rowHeaderLabel}
              </th>
              {visibleColumns.map((column) => (
                <th key={column.key} scope="col" className="criterion-matrix__col-head">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teamAverage ? (
              <tr className="criterion-matrix__row criterion-matrix__row--pinned">
                <th scope="row" className="criterion-matrix__row-head">
                  <span className="criterion-matrix__row-label">{teamAverage.label ?? "Среднее по команде"}</span>
                  {teamAverage.meta ? (
                    <span className="criterion-matrix__row-meta">{teamAverage.meta}</span>
                  ) : null}
                </th>
                {visibleColumns.map((column) => (
                  <MatrixCell
                    key={column.key}
                    cell={teamAverage.cells[column.key] ?? { value: null }}
                  />
                ))}
              </tr>
            ) : null}
            {rows.map((row) => {
              const labelContent = (
                <>
                  <span className="criterion-matrix__row-label">{row.label}</span>
                  {row.meta ? <span className="criterion-matrix__row-meta">{row.meta}</span> : null}
                </>
              );

              return (
                <tr key={row.key} className="criterion-matrix__row">
                  <th scope="row" className="criterion-matrix__row-head">
                    {row.href ? (
                      <Link href={row.href} className="criterion-matrix__row-link">
                        {labelContent}
                      </Link>
                    ) : (
                      labelContent
                    )}
                  </th>
                  {visibleColumns.map((column) => (
                    <MatrixCell key={column.key} cell={row.cells[column.key] ?? { value: null }} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
