import { describe, expect, it, vi } from "vitest";
import { recordReviewEvent } from "@/lib/review-events";

describe("review event recorder", () => {
  it("stores metadata as JSON and preserves lifecycle statuses", async () => {
    const client = {
      reviewEvent: {
        create: vi.fn().mockResolvedValue({ id: "event-1" })
      }
    };

    await recordReviewEvent(client, {
      workspaceId: "workspace-1",
      reviewId: "review-1",
      conversationId: "conversation-1",
      actorId: "user-1",
      action: "review.finalized",
      fromStatus: "DRAFT",
      toStatus: "FINALIZED",
      metadata: { totalScore: 88 }
    });

    expect(client.reviewEvent.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        reviewId: "review-1",
        conversationId: "conversation-1",
        actorId: "user-1",
        action: "review.finalized",
        fromStatus: "DRAFT",
        toStatus: "FINALIZED",
        metadata: JSON.stringify({ totalScore: 88 })
      }
    });
  });
});

