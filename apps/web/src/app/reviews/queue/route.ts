import { NextResponse } from "next/server";

const QUEUED_REVIEWS_HREF = "/reviews?qaStatus=QUEUED";

/** Legacy path. Nav and KPI drills stay on the query filter. */
export function GET() {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: QUEUED_REVIEWS_HREF }
  });
}
