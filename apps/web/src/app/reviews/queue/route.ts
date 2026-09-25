import { NextResponse } from "next/server";

const QUEUED_REVIEWS_HREF = "/reviews?qaStatus=QUEUED";

/** Legacy path. Nav and KPI drills stay on the query filter. */
export function GET(request: Request) {
  return NextResponse.redirect(new URL(QUEUED_REVIEWS_HREF, request.url));
}
