import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { loadReportExportRows, reportExportFilename, reportRowsToCsv } from "@/lib/report-export";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await requireCurrentUserPermission("reports:read");
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { period, rows } = await loadReportExportRows(user.workspaceId, params);

  return new NextResponse(reportRowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reportExportFilename(period, "csv")}"`
    }
  });
}
