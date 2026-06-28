import { describe, expect, it, vi } from "vitest";

const draftCreateMock = vi.fn();
const draftUpdateMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    aiQualityDraft: {
      create: draftCreateMock,
      update: draftUpdateMock
    }
  }
}));

describe("AI Quality Ops drafts", () => {
  it("creates advisory drafts that are not final decisions", async () => {
    const { createAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    draftCreateMock.mockResolvedValue({
      id: "draft-1",
      status: "draft",
      kind: "risk_tag",
      suggestedValueJson: JSON.stringify({ risk: "HIGH" }),
      evidenceRefsJson: JSON.stringify(["message-1"])
    });

    await createAiQualityDraft({
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      kind: "risk_tag",
      modelVersion: "ai-quality-v1",
      promptVersion: "risk-v1",
      suggestedValue: { risk: "HIGH" },
      evidenceRefs: ["message-1"]
    });

    expect(draftCreateMock.mock.calls[0][0].data.status).toBe("draft");
    expect(draftCreateMock.mock.calls[0][0].data.finalizedById).toBeNull();
    expect(draftCreateMock.mock.calls[0][0].data.suggestedValueJson).toBe(JSON.stringify({ risk: "HIGH" }));
    expect(draftCreateMock.mock.calls[0][0].data.evidenceRefsJson).toBe(JSON.stringify(["message-1"]));
  });

  it("requires a human actor to approve or reject a draft", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    await expect(
      decideAiQualityDraft({
        draftId: "draft-1",
        decision: "approved",
        actorId: "",
        reason: "Looks right"
      })
    ).rejects.toThrow("AI draft decisions require a human actor.");
  });

  it("persists changed AI suggestions as a human decision", async () => {
    const { decideAiQualityDraft } = await import("@/lib/ai-quality/drafts");
    const now = new Date("2026-06-28T09:45:00.000Z");

    await decideAiQualityDraft({
      draftId: "draft-1",
      decision: "changed",
      actorId: "user-1",
      reason: "Evidence says medium risk.",
      changedValue: { risk: "MEDIUM" },
      decidedAt: now
    });

    expect(draftUpdateMock).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data: {
        status: "changed",
        finalizedById: "user-1",
        finalizedAt: now,
        decisionReason: "Evidence says medium risk.",
        suggestedValueJson: JSON.stringify({ risk: "MEDIUM" })
      }
    });
  });
});
