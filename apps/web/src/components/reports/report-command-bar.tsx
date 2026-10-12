"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger
} from "@/components/ui/menubar";
import type { ReportPeriod } from "@/lib/report-period";
import { buildReportAnalysisHref, type ReportFilterCatalog } from "@/lib/reports/report-analysis-state";
import { reportExportFormatHref, reportExportHref, reportViews } from "@/lib/reports/report-format";

/** SSR keeps stable chrome; popup IDs mount after hydration. */
export function ReportExportMenu({ period, filters, currentHref, catalog }: {
  period: ReportPeriod;
  filters: Record<string, string>;
  currentHref: string;
  catalog: ReportFilterCatalog;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button type="button" variant="outline" size="sm" disabled aria-busy="true"><Download data-icon="inline-start" aria-hidden="true" />Экспорт</Button>;
  }

  return (
    <Menubar modal={false} aria-label="Действия отчёта" className="h-auto min-h-8 flex-wrap">
      <MenubarMenu>
        <MenubarTrigger>Представление</MenubarTrigger>
        <MenubarContent>
          {reportViews.map((view) => <MenubarItem key={view.id} render={<Link href={buildReportAnalysisHref(currentHref, { view: view.id, evidenceType: null, evidenceKey: null }, catalog)} />} nativeButton={false}>{view.label}</MenubarItem>)}
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Фильтры</MenubarTrigger>
        <MenubarContent>
          <MenubarItem render={<Link href={buildReportAnalysisHref(currentHref, { team: null, source: null, risk: null, block: null, evidenceType: null, evidenceKey: null }, catalog)} />} nativeButton={false}>Сбросить срезы</MenubarItem>
          <MenubarItem render={<Link href={buildReportAnalysisHref(currentHref, { compare: "none", evidenceType: null, evidenceKey: null }, catalog)} />} nativeButton={false}>Без сравнения</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger><Download className="mr-1 size-4" aria-hidden="true" />Экспорт</MenubarTrigger>
        <MenubarContent align="end">
          <MenubarItem render={<a href={reportExportHref(period, filters)} />} nativeButton={false}>CSV</MenubarItem>
          <MenubarItem render={<a href={reportExportFormatHref(period, "xlsx", filters)} />} nativeButton={false}>XLSX</MenubarItem>
          <MenubarItem render={<a href={reportExportFormatHref(period, "pdf", filters)} />} nativeButton={false}>PDF</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
