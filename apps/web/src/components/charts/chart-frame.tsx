import type { ReactNode } from "react";
import Link from "next/link";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartDataTable } from "@/components/charts/chart-data-table";
import {
  ChartViewLinks,
  type ChartView
} from "@/components/charts/chart-view-links";
import { chartUnitLabel } from "@/lib/charts/builders";
import type { ChartModel } from "@/lib/charts/contracts";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";

type ChartFrameAction = {
  label: string;
  href: string;
};

export type ChartFrameState =
  | { kind: "ready" }
  | { kind: "loading"; label?: string }
  | { kind: "empty"; action?: ChartFrameAction }
  | {
      kind: "error";
      message: string;
      retryHref?: string;
      retryLabel?: string;
    };

export type ChartSample = {
  size: number;
  denominator?: number;
  minimum?: number;
};

export type ChartComparison =
  | { status: "current" }
  | { status: "stale"; asOf: string };

export function ChartFrame({
  model,
  view,
  currentHref,
  periodLabel,
  sample,
  comparison = { status: "current" },
  state = { kind: "ready" },
  graph
}: {
  model: ChartModel;
  view: ChartView;
  currentHref: string;
  periodLabel: string;
  sample: ChartSample;
  comparison?: ChartComparison;
  state?: ChartFrameState;
  graph?: ReactNode;
}) {
  const headingId = `chart-${model.id}-title`;
  const units = Array.from(new Set(model.series.map((series) => series.unit)))
    .map(chartUnitLabel)
    .join(", ");
  const sampleLabel =
    sample.denominator == null
      ? String(sample.size)
      : `${sample.size} из ${sample.denominator}`;
  const hasLowSample = sample.minimum != null && sample.size < sample.minimum;

  return (
    <Card aria-labelledby={headingId} size="sm" className="h-full gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle id={headingId}>{model.title}</CardTitle>
        {model.description ? <CardDescription>{model.description}</CardDescription> : null}
        <CardAction>
          <ChartViewLinks currentHref={currentHref} view={view} labelledBy={headingId} />
        </CardAction>
        <div className="col-span-full flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Период: {periodLabel}</span>
          <span>Единицы: {units}</span>
          <span>Выборка: {sampleLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="py-4">
        <div data-slot="chart-frame-content" className="min-h-60">
          {state.kind === "loading" ? (
            <div
              role="status"
              aria-label={state.label ?? "Загрузка данных графика"}
              className="grid min-h-60 gap-3"
            >
              <Skeleton aria-hidden="true" className="h-full min-h-60" />
            </div>
          ) : null}

          {state.kind === "empty" ? (
            <EmptyState
              title={model.emptyTitle}
              description={model.emptyDescription}
              size="inline"
              action={
                state.action ? (
                  <Link
                    href={state.action.href}
                    {...reportPageLocalLinkProps(state.action.href)}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {state.action.label}
                  </Link>
                ) : undefined
              }
            />
          ) : null}

          {state.kind === "error" ? (
            <Alert>
              <AlertTitle>Не удалось загрузить данные</AlertTitle>
              <AlertDescription>{state.message}</AlertDescription>
              {state.retryHref ? (
                <AlertAction>
                  <Link
                    href={state.retryHref}
                    {...reportPageLocalLinkProps(state.retryHref)}
                    className={buttonVariants({ variant: "outline", size: "xs" })}
                  >
                    {state.retryLabel ?? "Повторить"}
                  </Link>
                </AlertAction>
              ) : null}
            </Alert>
          ) : null}

          {state.kind === "ready" ? (
            <div className="flex min-h-60 flex-col gap-3">
              {hasLowSample ? (
                <p className="text-sm text-muted-foreground">
                  Недостаточно выборки: {sample.size} из {sample.minimum}
                </p>
              ) : null}
              {comparison.status === "stale" ? (
                <p className="text-sm text-muted-foreground">
                  База сравнения устарела: {comparison.asOf}
                </p>
              ) : null}
              {view === "table" ? <ChartDataTable model={model} /> : graph}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
