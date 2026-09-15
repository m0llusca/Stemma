"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import type { ReportPeriod } from "@/lib/report-period";
import {
  reportExportFormatHref,
  reportExportHref
} from "@/lib/reports/report-format";

/**
 * Export menu — sits in the PageShell `actions` slot. Dropdown with CSV / XLSX / PDF.
 * Menu chrome mounts after the client effect: Base UI Trigger stamps aria-* /
 * popup ids that do not match the SSR HTML on `/reports`.
 */
export function ReportExportMenu({ period }: { period: ReportPeriod }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const trigger = (
    <>
      <Download data-icon="inline-start" aria-hidden="true" />
      Экспорт
    </>
  );

  if (!mounted) {
    return (
      <Button type="button" variant="outline" size="sm">
        {trigger}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
      >
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuItem render={<Link href={reportExportHref(period)} />} nativeButton={false}>
          CSV
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={reportExportFormatHref(period, "xlsx")} />} nativeButton={false}>
          XLSX
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href={reportExportFormatHref(period, "pdf")} />} nativeButton={false}>
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
