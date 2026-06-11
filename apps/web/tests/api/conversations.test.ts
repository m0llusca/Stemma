import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    apiToken: {
      findUnique: vi.fn(),
      update: vi.fn()
    },
    conversation: {
      findFirst: vi.fn(),
      upsert: vi.fn()
    },
    message: {
      upsert: vi.fn(),
      deleteMany: vi.fn()
    },
    samplingRule: {
      findMany: vi.fn()
    },
    review: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

const currentUser = {
  id: "user-1",
  workspaceId: "workspace-1",
  role: "QA_ANALYST",
  workspace: { id: "workspace-1", name: "Demo Support QA" }
};

function apiRequest(token: string | null = "qa_test_token") {
  const headers = new Headers();

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return new Request("http://localhost/api/reviews/export", {
    headers
  }) as NextRequest;
}

function jsonRequest(body: unknown, token: string | null = "qa_test_token") {
  const headers = new Headers({ "content-type": "application/json" });

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }

  return new Request("http://localhost/api/conversations", {
    method: "POST",
    body: JSON.stringify(body),
    headers
  }) as NextRequest;
}

describe("custom conversation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(currentUser);
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "api-token-1",
      workspaceId: "workspace-1",
      scopes: "conversations:write,reviews:read",
      expiresAt: null
    });
    mocks.prisma.apiToken.update.mockResolvedValue({});
    mocks.prisma.samplingRule.findMany.mockResolvedValue([]);
    mocks.prisma.message.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("requires a bearer token before ingesting conversations", async () => {
    const { POST } = await import("@/app/api/conversations/route");

    const response = await POST(jsonRequest({ externalId: "conv-123" }, null));

    await expect(response.json()).resolves.toEqual({ error: "API token is required." });
    expect(response.status).toBe(401);
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("upserts a conversation and its messages", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    mocks.prisma.conversation.upsert.mockResolvedValue({ id: "conv-db-1" });
    mocks.prisma.message.upsert.mockResolvedValueOnce({ id: "msg-db-1" }).mockResolvedValueOnce({ id: "msg-db-2" });

    const response = await POST(
      jsonRequest({
        externalSource: "custom_api",
        externalId: "conv-123",
        externalUrl: "https://example.com/conversations/conv-123",
        channel: "chat",
        subject: "Refund request",
        status: "closed",
        tags: ["refund", "delivery"],
        customerName: "Ava Customer",
        assigneeName: "Sam Agent",
        samplingReason: "High-value customer",
        samplingType: "dsat",
        csatScore: 2,
        supportLine: "L1",
        teamName: "Refunds",
        riskHint: "Policy risk",
        openedAt: "2026-04-25T10:00:00.000Z",
        closedAt: "2026-04-25T10:30:00.000Z",
        messages: [
          {
            externalId: "msg-1",
            participantType: "customer",
            authorName: "Ava Customer",
            body: "Where is my refund?",
            sentAt: "2026-04-25T10:00:00.000Z"
          },
          {
            externalId: "msg-2",
            participantType: "human_agent",
            authorName: "Sam Agent",
            body: "I can help.",
            sentAt: "2026-04-25T10:04:00.000Z",
            isPrivate: true
          }
        ]
      })
    );

    await expect(response.json()).resolves.toEqual({ id: "conv-db-1" });
    expect(response.status).toBe(201);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastUsedAt: expect.any(Date)
      }
    });
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastSuccessAt: expect.any(Date),
        lastError: null
      }
    });
    expect(mocks.prisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId: "workspace-1",
          externalSource: "custom_api",
          externalId: "conv-123"
        }
      },
      create: expect.objectContaining({
        workspaceId: "workspace-1",
        channel: "CHAT",
        tags: "refund,delivery",
        samplingType: "DSAT",
        csatBucket: "NEGATIVE",
        supportLine: "L1"
      }),
      update: expect.objectContaining({
        channel: "CHAT",
        tags: "refund,delivery",
        samplingType: "DSAT",
        csatBucket: "NEGATIVE",
        supportLine: "L1"
      })
    });
    expect(mocks.prisma.conversation.upsert.mock.calls[0][0].create.messages).toBeUndefined();
    expect(mocks.prisma.message.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.message.upsert).toHaveBeenCalledWith({
      where: {
        conversationId_externalId: {
          conversationId: "conv-db-1",
          externalId: "msg-2"
        }
      },
      create: expect.objectContaining({
        conversationId: "conv-db-1",
        participantType: "HUMAN_AGENT",
        isPrivate: true
      }),
      update: expect.objectContaining({
        participantType: "HUMAN_AGENT",
        isPrivate: true
      })
    });
  });

  it("imports OTRS-family TicketGet payloads through the native endpoint", async () => {
    const { POST } = await import("@/app/api/integrations/otrs-family/tickets/route");
    mocks.prisma.conversation.upsert.mockResolvedValue({ id: "conv-db-otrs" });
    mocks.prisma.message.upsert.mockResolvedValueOnce({ id: "msg-db-101" }).mockResolvedValueOnce({ id: "msg-db-102" });

    const response = await POST(
      jsonRequest({
        source: "znuny",
        baseUrl: "https://support.example.com/otrs",
        samplingType: "dsat",
        csatScore: 1,
        supportLine: "2ЛП",
        teamName: "ФГИС",
        ticketGet: {
          Success: 1,
          Ticket: {
            TicketID: "42",
            TicketNumber: "20260502000042",
            Title: "Refund request from Znuny",
            State: "closed successful",
            Queue: "Support::Refunds",
            Priority: "3 normal",
            CustomerUserID: "ava@example.com",
            Owner: "Sam Agent",
            Created: "2026-04-25 10:00:00",
            Article: [
              {
                ArticleID: "101",
                SenderType: "customer",
                From: "Ava Customer",
                Body: "Where is my refund?",
                Created: "2026-04-25 10:00:00",
                IsVisibleForCustomer: 1,
                CommunicationChannel: "Email"
              },
              {
                ArticleID: "102",
                SenderType: "agent",
                From: "Sam Agent",
                Body: "I can help.",
                Created: "2026-04-25 10:04:00",
                IsVisibleForCustomer: 1,
                CommunicationChannel: "Email"
              }
            ]
          }
        }
      })
    );

    await expect(response.json()).resolves.toEqual({
      count: 1,
      imported: [
        {
          id: "conv-db-otrs",
          externalSource: "znuny",
          externalId: "42",
          subject: "Refund request from Znuny",
          messageCount: 2
        }
      ]
    });
    expect(response.status).toBe(201);
    expect(mocks.prisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId: "workspace-1",
          externalSource: "znuny",
          externalId: "42"
        }
      },
      create: expect.objectContaining({
        workspaceId: "workspace-1",
        channel: "EMAIL",
        customerName: "ava@example.com",
        samplingType: "DSAT",
        csatScore: 1,
        csatBucket: "NEGATIVE",
        supportLine: "2ЛП"
      }),
      update: expect.objectContaining({
        channel: "EMAIL",
        customerName: "ava@example.com",
        samplingType: "DSAT",
        csatScore: 1,
        csatBucket: "NEGATIVE",
        supportLine: "2ЛП"
      })
    });
    expect(mocks.prisma.message.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.message.upsert).toHaveBeenCalledWith({
      where: {
        conversationId_externalId: {
          conversationId: "conv-db-otrs",
          externalId: "102"
        }
      },
      create: expect.objectContaining({
        conversationId: "conv-db-otrs",
        participantType: "HUMAN_AGENT",
        isPrivate: false
      }),
      update: expect.objectContaining({
        participantType: "HUMAN_AGENT",
        isPrivate: false
      })
    });
  });

  it("imports native helpdesk payloads through the SaaS endpoint", async () => {
    const { POST } = await import("@/app/api/integrations/native-helpdesks/conversations/route");
    mocks.prisma.conversation.upsert.mockResolvedValue({ id: "conv-db-zendesk" });
    mocks.prisma.message.upsert.mockResolvedValueOnce({ id: "msg-db-501" }).mockResolvedValueOnce({ id: "msg-db-502" });

    const response = await POST(
      jsonRequest({
        source: "zendesk",
        baseUrl: "https://support.example.com",
        samplingType: "random",
        supportLine: "1ЛП",
        teamName: "Refunds",
        ticket: {
          id: 35436,
          subject: "Refund request from Zendesk",
          status: "solved",
          priority: "high",
          tags: ["refund", "delivery"],
          requester_id: 20978392,
          assignee_id: 235323,
          created_at: "2026-04-25T10:00:00Z",
          updated_at: "2026-04-25T10:18:00Z",
          via: { channel: "email" }
        },
        users: [
          { id: 20978392, name: "Ava Customer", is_staff: false },
          { id: 235323, name: "Sam Agent", is_staff: true }
        ],
        comments: [
          {
            id: 501,
            author_id: 20978392,
            plain_body: "Where is my refund?",
            public: true,
            created_at: "2026-04-25T10:00:00Z"
          },
          {
            id: 502,
            author_id: 235323,
            plain_body: "I can help.",
            public: true,
            created_at: "2026-04-25T10:08:00Z"
          }
        ]
      })
    );

    await expect(response.json()).resolves.toEqual({
      count: 1,
      imported: [
        {
          id: "conv-db-zendesk",
          externalSource: "zendesk",
          externalId: "35436",
          subject: "Refund request from Zendesk",
          messageCount: 2
        }
      ]
    });
    expect(response.status).toBe(201);
    expect(mocks.prisma.conversation.upsert).toHaveBeenCalledWith({
      where: {
        workspaceId_externalSource_externalId: {
          workspaceId: "workspace-1",
          externalSource: "zendesk",
          externalId: "35436"
        }
      },
      create: expect.objectContaining({
        workspaceId: "workspace-1",
        channel: "EMAIL",
        customerName: "Ava Customer",
        assigneeName: "Sam Agent",
        samplingType: "RANDOM",
        csatBucket: "NO_SCORE",
        supportLine: "1ЛП",
        teamName: "Refunds"
      }),
      update: expect.objectContaining({
        channel: "EMAIL",
        customerName: "Ava Customer",
        assigneeName: "Sam Agent",
        samplingType: "RANDOM",
        csatBucket: "NO_SCORE",
        supportLine: "1ЛП",
        teamName: "Refunds"
      })
    });
    expect(mocks.prisma.message.upsert).toHaveBeenCalledTimes(2);
  });

  it("rejects oversized custom conversation payloads before database writes", async () => {
    const { POST } = await import("@/app/api/conversations/route");
    const { customConversationLimits } = await import("@/lib/validation/custom-api");

    const response = await POST(
      jsonRequest({
        externalSource: "custom_api",
        externalId: "conv-too-large",
        channel: "ticket",
        subject: "Oversized import",
        status: "closed",
        customerName: "Ava Customer",
        samplingReason: "Backend limit check",
        openedAt: "2026-04-25T10:00:00.000Z",
        messages: Array.from({ length: customConversationLimits.maxMessagesPerConversation + 1 }, (_, index) => ({
          externalId: `msg-${index + 1}`,
          participantType: "customer",
          authorName: "Ava Customer",
          body: "Message body",
          sentAt: "2026-04-25T10:00:00.000Z"
        }))
      })
    );

    await expect(response.json()).resolves.toEqual({ error: "Invalid custom conversation payload." });
    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.message.upsert).not.toHaveBeenCalled();
  });

  it("rejects oversized native helpdesk batches before database writes", async () => {
    const { POST } = await import("@/app/api/integrations/native-helpdesks/conversations/route");
    const { customConversationLimits } = await import("@/lib/validation/custom-api");
    const expectedError = `За один запрос можно импортировать не более ${customConversationLimits.maxConversationsPerImportRequest} обращений.`;

    const response = await POST(
      jsonRequest({
        source: "zendesk",
        tickets: Array.from({ length: customConversationLimits.maxConversationsPerImportRequest + 1 }, (_, index) => ({
          id: `ticket-${index + 1}`,
          subject: `Ticket ${index + 1}`,
          status: "solved",
          description: "Customer asks for help.",
          requester_id: "customer-1",
          created_at: "2026-04-25T10:00:00.000Z",
          updated_at: "2026-04-25T10:05:00.000Z"
        }))
      })
    );

    await expect(response.json()).resolves.toEqual({ error: expectedError });
    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.message.upsert).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid conversation payloads", async () => {
    const { POST } = await import("@/app/api/conversations/route");

    const response = await POST(jsonRequest({ externalId: "missing-required-fields" }));

    await expect(response.json()).resolves.toEqual({ error: "Invalid custom conversation payload." });
    expect(response.status).toBe(400);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastErrorAt: expect.any(Date),
        lastError: "Invalid custom conversation payload."
      }
    });
    expect(mocks.prisma.conversation.upsert).not.toHaveBeenCalled();
  });

  it("upserts a message only when the conversation belongs to the workspace", async () => {
    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    mocks.prisma.conversation.findFirst.mockResolvedValue({ id: "conv-db-1" });
    mocks.prisma.message.upsert.mockResolvedValue({ id: "msg-db-1" });

    const response = await POST(
      jsonRequest({
        externalId: "msg-1",
        participantType: "ai_agent",
        authorName: "AI Assistant",
        body: "Suggested answer.",
        sentAt: "2026-04-25T10:06:00.000Z"
      }),
      { params: Promise.resolve({ id: "conv-db-1" }) }
    );

    await expect(response.json()).resolves.toEqual({ id: "msg-db-1" });
    expect(response.status).toBe(201);
    expect(mocks.prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: "conv-db-1",
        workspaceId: "workspace-1"
      },
      select: { id: true }
    });
    expect(mocks.prisma.message.upsert).toHaveBeenCalledWith({
      where: {
        conversationId_externalId: {
          conversationId: "conv-db-1",
          externalId: "msg-1"
        }
      },
      create: expect.objectContaining({
        conversationId: "conv-db-1",
        participantType: "AI_AGENT",
        isPrivate: false
      }),
      update: expect.objectContaining({
        participantType: "AI_AGENT",
        isPrivate: false
      })
    });
  });

  it("returns 404 before message validation when the conversation is outside the workspace", async () => {
    const { POST } = await import("@/app/api/conversations/[id]/messages/route");
    mocks.prisma.conversation.findFirst.mockResolvedValue(null);

    const response = await POST(jsonRequest({}), { params: Promise.resolve({ id: "conv-db-2" }) });

    await expect(response.json()).resolves.toEqual({ error: "Conversation not found." });
    expect(response.status).toBe(404);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastErrorAt: expect.any(Date),
        lastError: "Conversation not found."
      }
    });
    expect(mocks.prisma.message.upsert).not.toHaveBeenCalled();
  });

  it("exports reviews for the current workspace with the planned JSON shape", async () => {
    const { GET } = await import("@/app/api/reviews/export/route");
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "api-token-1",
      workspaceId: "workspace-1",
      scopes: "reviews:read",
      expiresAt: null
    });
    mocks.prisma.review.findMany.mockResolvedValue([
      {
        id: "review-1",
        status: "FINALIZED",
        reviewSource: "HUMAN",
        rubricVersion: 1,
        totalScore: 92,
        confidence: null,
        summary: "Strong resolution.",
        feedbackComment: "Clear feedback.",
        positiveNotes: "Good tone.",
        instructionLinks: "https://kb.example.com/refunds",
        feedbackStatus: "feedback_sent",
        appealStatus: "none",
        appealDueAt: null,
        appealResolvedAt: null,
        criticalError: false,
        criticalCategory: null,
        needsReanswer: false,
        reanswerStatus: "not_needed",
        calibrationStatus: "none",
        calibrationNotes: "",
        finalizedAt: new Date("2026-04-26T12:00:00.000Z"),
        createdAt: new Date("2026-04-26T11:50:00.000Z"),
        conversation: {
          id: "conv-db-1",
          externalSource: "custom_api",
          externalId: "conv-123",
          externalUrl: null,
          channel: "CHAT",
          subject: "Refund request",
          status: "closed",
          tags: "refund,delivery",
          customerName: "Ava Customer",
          assigneeName: "Sam Agent",
          samplingReason: "High-value customer",
          samplingType: "DSAT",
          csatScore: 2,
          csatBucket: "NEGATIVE",
          supportLine: "L1",
          teamName: "Refunds",
          riskHint: null,
          openedAt: new Date("2026-04-25T10:00:00.000Z"),
          closedAt: null
        },
        reviewer: {
          id: "user-1",
          email: "qa@example.com",
          name: "QA Analyst",
          role: "QA_ANALYST"
        },
        scores: [
          {
            value: 3,
            passed: null,
            isNotApplicable: false,
            comment: "Accurate.",
            evidenceMessageId: "msg-db-1",
            criterion: {
              id: "criterion-1",
              key: "accuracy",
              label: "Accuracy",
              block: "Resolution",
              kind: "SCALE_1_3",
              weight: 30,
              order: 1
            }
          }
        ],
        findings: [
          {
            id: "finding-1",
            ownerType: "AGENT",
            category: "Resolution",
            rootCause: "None",
            riskLevel: "LOW",
            evidenceSummary: "Good answer.",
            coachingAction: {
              assignee: "Sam Agent",
              action: "Share example.",
              dueAt: new Date("2026-05-01T00:00:00.000Z"),
              status: "open"
            }
          }
        ]
      }
    ]);

    const response = await GET(apiRequest());

    await expect(response.json()).resolves.toEqual({
      meta: {
        count: 1,
        truncated: false
      },
      reviews: [
        {
          id: "review-1",
          status: "FINALIZED",
          reviewSource: "HUMAN",
          rubricVersion: 1,
          totalScore: 92,
          confidence: null,
          summary: "Strong resolution.",
          feedbackComment: "Clear feedback.",
          positiveNotes: "Good tone.",
          instructionLinks: "https://kb.example.com/refunds",
          feedbackStatus: "feedback_sent",
          appealStatus: "none",
          appealDueAt: null,
          appealResolvedAt: null,
          criticalError: false,
          criticalCategory: null,
          needsReanswer: false,
          reanswerStatus: "not_needed",
          calibrationStatus: "none",
          calibrationNotes: "",
          finalizedAt: "2026-04-26T12:00:00.000Z",
          createdAt: "2026-04-26T11:50:00.000Z",
          conversation: {
            id: "conv-db-1",
            externalSource: "custom_api",
            externalId: "conv-123",
            externalUrl: null,
            channel: "CHAT",
            subject: "Refund request",
            status: "closed",
            tags: "refund,delivery",
            customerName: "Ava Customer",
            assigneeName: "Sam Agent",
            samplingReason: "High-value customer",
            samplingType: "DSAT",
            csatScore: 2,
            csatBucket: "NEGATIVE",
            supportLine: "L1",
            teamName: "Refunds",
            riskHint: null,
            openedAt: "2026-04-25T10:00:00.000Z",
            closedAt: null
          },
          reviewer: "qa@example.com",
          scores: [
            {
              criterion: "accuracy",
              criterionLabel: "Accuracy",
              criterionBlock: "Resolution",
              weight: 30,
              value: 3,
              passed: null,
              isNotApplicable: false,
              comment: "Accurate."
            }
          ],
          findings: [
            {
              ownerType: "AGENT",
              category: "Resolution",
              rootCause: "None",
              riskLevel: "LOW",
              coachingAction: "Share example."
            }
          ]
        }
      ]
    });
    expect(response.status).toBe(200);
    expect(mocks.prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "api-token-1" },
      data: {
        lastSuccessAt: expect.any(Date),
        lastError: null
      }
    });
    expect(mocks.prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1" }
      })
    );
  });

  it("returns 403 when a token is missing the required scope", async () => {
    const { GET } = await import("@/app/api/reviews/export/route");
    mocks.prisma.apiToken.findUnique.mockResolvedValue({
      id: "api-token-1",
      workspaceId: "workspace-1",
      scopes: "conversations:write",
      expiresAt: null
    });

    const response = await GET(apiRequest());

    await expect(response.json()).resolves.toEqual({ error: "API token does not have the required scope." });
    expect(response.status).toBe(403);
    expect(mocks.prisma.review.findMany).not.toHaveBeenCalled();
  });
});
