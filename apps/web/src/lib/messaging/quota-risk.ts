import { enqueueBackendJob, type EnqueueJobClient } from "@/lib/jobs/enqueue";
import type { MessagingDeliveryJobPayload } from "@/lib/messaging/job-contract";

export type QuotaRiskInput = {
  workspaceId: string;
  completionPercent: number;
  actualCount: number;
  plannedCount: number;
  periodLabel?: string;
  href?: string;
};

/**
 * Builds a MESSAGING_DELIVERY payload when the reporting period quota is behind plan.
 * Callers should invoke this from a server-side quota evaluation seam — today the
 * reports page only surfaces quota risk in UI, without enqueueing notifications.
 */
export function buildQuotaRiskMessagingPayload(input: QuotaRiskInput): MessagingDeliveryJobPayload {
  const body = input.periodLabel
    ? `${input.periodLabel}: выполнено ${input.actualCount} из ${input.plannedCount} (${input.completionPercent}%). Выводы по периоду могут быть неполными.`
    : `Выполнено ${input.actualCount} из ${input.plannedCount} (${input.completionPercent}%). Выводы по периоду могут быть неполными.`;

  return {
    eventType: "quota.at_risk",
    recipientType: "manager",
    context: {
      title: "План проверок под риском",
      body,
      href: input.href ?? "/reports?view=details"
    }
  };
}

export async function enqueueQuotaRiskMessaging(input: QuotaRiskInput, client?: EnqueueJobClient) {
  return enqueueBackendJob(
    {
      workspaceId: input.workspaceId,
      type: "MESSAGING_DELIVERY",
      payload: buildQuotaRiskMessagingPayload(input)
    },
    client
  );
}
