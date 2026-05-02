import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
const adapter = new PrismaBetterSqlite3({
  url: databaseUrl === "file:./dev.db" ? "file:./prisma/dev.db" : databaseUrl
});
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.coachingAction.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.criterionScore.deleteMany();
  await prisma.review.deleteMany();
  await prisma.scorecardCriterion.deleteMany();
  await prisma.scorecard.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.integration.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const workspace = await prisma.workspace.create({
    data: { name: "Demo Support QA" }
  });

  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "admin@example.com",
      name: "Admin User",
      role: "ADMIN"
    }
  });

  const analyst = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "qa@example.com",
      name: "QA Analyst",
      role: "QA_ANALYST"
    }
  });

  const scorecard = await prisma.scorecard.create({
    data: {
      workspaceId: workspace.id,
      name: "Digital Support QA",
      version: 1,
      criteria: {
        create: [
          { key: "accuracy", label: "Accuracy", kind: "SCALE_1_3", weight: 30, order: 1 },
          { key: "resolution", label: "Resolution quality", kind: "SCALE_1_3", weight: 25, order: 2 },
          { key: "policy", label: "Policy and compliance", kind: "PASS_FAIL", weight: 20, order: 3 },
          { key: "tone", label: "Tone and empathy", kind: "SCALE_1_3", weight: 15, order: 4 },
          { key: "clarity", label: "Writing clarity", kind: "SCALE_1_3", weight: 10, order: 5 }
        ]
      }
    }
  });

  const conversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      externalSource: "demo_import",
      externalId: "conv-1001",
      externalUrl: "https://example.com/tickets/1001",
      channel: "CHAT",
      subject: "Refund request after delayed delivery",
      status: "closed",
      tags: "refund,delivery,high-value",
      customerName: "Mila Petrova",
      assigneeName: "Ivan Support",
      samplingReason: "High risk: refund policy",
      riskHint: "Potential policy miss",
      openedAt: new Date("2026-04-25T10:00:00.000Z"),
      closedAt: new Date("2026-04-25T10:18:00.000Z"),
      messages: {
        create: [
          {
            externalId: "msg-1",
            participantType: "CUSTOMER",
            authorName: "Mila Petrova",
            body: "My delivery is late and I want a refund.",
            sentAt: new Date("2026-04-25T10:00:00.000Z")
          },
          {
            externalId: "msg-2",
            participantType: "HUMAN_AGENT",
            authorName: "Ivan Support",
            body: "I can help. The order is still in transit, so we can offer store credit today or a refund after carrier confirmation.",
            sentAt: new Date("2026-04-25T10:04:00.000Z")
          },
          {
            externalId: "msg-3",
            participantType: "CUSTOMER",
            authorName: "Mila Petrova",
            body: "Store credit works if it arrives this week.",
            sentAt: new Date("2026-04-25T10:09:00.000Z")
          },
          {
            externalId: "msg-4",
            participantType: "HUMAN_AGENT",
            authorName: "Ivan Support",
            body: "I issued store credit and added a carrier follow-up. You will get an update by Friday.",
            sentAt: new Date("2026-04-25T10:18:00.000Z")
          }
        ]
      }
    }
  });

  await prisma.integration.createMany({
    data: [
      {
        workspaceId: workspace.id,
        source: "zendesk",
        displayName: "Zendesk",
        status: "planned"
      },
      {
        workspaceId: workspace.id,
        source: "otrs_family",
        displayName: "Znuny / OTRS / OTOBO",
        status: "planned"
      }
    ]
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorId: admin.id,
      action: "seed.created",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: JSON.stringify({ analystId: analyst.id, scorecardId: scorecard.id, conversationId: conversation.id })
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
