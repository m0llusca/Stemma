import Link from "next/link";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { chartUnitLabel, formatChartValue } from "@/lib/charts/builders";
import type { ChartModel } from "@/lib/charts/contracts";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";

export function ChartDataTable({ model }: { model: ChartModel }) {
  const showsPointSample = model.points.some((point) => point.sampleSize != null);
  const tableLabel = `Табличные данные: ${model.title}`;

  return (
    <div
      role="region"
      aria-label={tableLabel}
      tabIndex={0}
      data-slot="chart-data-table-scroll-region"
      className="min-w-0 overflow-x-auto rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&>[data-slot=table-container]]:overflow-visible"
    >
      <Table aria-label={tableLabel} className="min-w-max">
        <TableCaption className="sr-only">
          Табличное представление графика «{model.title}»
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{model.xLabel ?? "Период"}</TableHead>
            {model.series.map((series) => (
              <TableHead key={series.key} scope="col">
                {series.label}, {chartUnitLabel(series.unit)}
              </TableHead>
            ))}
            {showsPointSample ? <TableHead scope="col">Выборка, количество</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.points.map((point) => (
            <TableRow key={point.id}>
              <TableHead scope="row">
                {point.href ? (
                  <Link
                    href={point.href}
                    {...reportPageLocalLinkProps(point.href)}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {point.label}
                  </Link>
                ) : (
                  point.label
                )}
              </TableHead>
              {model.series.map((series) => (
                <TableCell key={series.key}>
                  {formatChartValue(point.values[series.key] ?? null, series.unit)}
                </TableCell>
              ))}
              {showsPointSample ? (
                <TableCell>
                  {point.sampleSize == null ? "Нет данных" : formatChartValue(point.sampleSize, "count")}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
