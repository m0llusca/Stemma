import { certificationDisplayTone } from "@/lib/certification/status";
import type { StatusTone } from "@/lib/ui/status-tone";

/**
 * Honesty gate for connection/channel chips.
 * `ready` / `active` is operational state, not production-green.
 * Green only when the cert chip would also be green (live cert).
 */
export function integrationConnectionTone(
  status: string,
  certificationStatus?: string | null
): StatusTone {
  if (status === "error") {
    return "negative";
  }

  if (status === "disabled") {
    return "warning";
  }

  if (status === "queued") {
    return "info";
  }

  if (status === "active" || status === "ready") {
    return certificationDisplayTone(certificationStatus ?? "") === "positive" ? "positive" : "warning";
  }

  return "neutral";
}

/** Same honesty gate as connection chips: no green without live_certified. */
export function messagingChannelTone(
  status: string,
  certificationStatus?: string | null
): StatusTone {
  return integrationConnectionTone(status, certificationStatus);
}
