import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/current-user";
import { loadReportExportRows, reportExportFilename, reportRowsToPdf } from "@/lib/report-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const { period, rows } = await loadReportExportRows(user.workspaceId, params);

  const pdf = await reportRowsToPdf(rows, period);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${reportExportFilename(period, "pdf")}"`
    }
  });
}
