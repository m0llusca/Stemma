import { describe, expect, it, vi } from "vitest";
import {
  buildQuotaRiskMessagingPayload,
  enqueueQuotaRiskMessaging
} from "@/lib/messaging/quota-risk";
import { parseMessagingDeliveryJobPayload } from "@/lib/messaging/job-contract";

const mocks = vi.hoisted(() => ({
  enqueueBackendJob: vi.fn(async () => ({ id: "job-1" }))
}));

vi.mock("@/lib/jobs/enqueue", () => ({
  enqueueBackendJob: mocks.enqueueBackendJob
}));

describe("quota risk messaging helper", () => {
  it("builds a Russian quota.at_risk payload for the delivery worker", () => {
    const payload = buildQuotaRiskMessagingPayload({
      workspaceId: "workspace-1",
      completionPercent: 72,
      actualCount: 18,
      plannedCount: 25,
      periodLabel: "Март 2026"
    });

    expect(payload.eventType).toBe("quota.at_risk");
    expect(payload.recipientType).toBe("manager");
    expect(payload.context.title).toMatch(/план проверок/i);
    expect(payload.context.body).toMatch(/18 из 25/);
    expect(payload.context.body).toMatch(/72%/);
    expect(parseMessagingDeliveryJobPayload(payload)).not.toBeNull();
  });

  it("enqueues a MESSAGING_DELIVERY job with the built payload", async () => {
    await enqueueQuotaRiskMessaging({
      workspaceId: "workspace-1",
      completionPercent: 55,
      actualCount: 11,
      plannedCount: 20
    });

    expect(mocks.enqueueBackendJob).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "MESSAGING_DELIVERY",
        payload: expect.objectContaining({ eventType: "quota.at_risk" })
      }),
      undefined
    );
  });

});
