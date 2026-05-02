import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { demoApiToken } from "../src/lib/custom-api-docs";

const prisma = new PrismaClient();

function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

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
  await prisma.apiToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();

  const workspace = await prisma.workspace.create({
    data: { name: "Демо Контроль качества" }
  });

  const admin = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "admin@example.com",
      name: "Администратор",
      role: "ADMIN"
    }
  });

  const analyst = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "qa@example.com",
      name: "QA-аналитик",
      role: "QA_ANALYST"
    }
  });

  const scorecard = await prisma.scorecard.create({
    data: {
      workspaceId: workspace.id,
      name: "Цифровая поддержка",
      version: 1,
      criteria: {
        create: [
          { key: "accuracy", label: "Точность ответа", kind: "SCALE_1_3", weight: 30, order: 1 },
          { key: "resolution", label: "Качество решения", kind: "SCALE_1_3", weight: 25, order: 2 },
          { key: "policy", label: "Политики и комплаенс", kind: "PASS_FAIL", weight: 20, order: 3 },
          { key: "tone", label: "Тон и эмпатия", kind: "SCALE_1_3", weight: 15, order: 4 },
          { key: "clarity", label: "Ясность письма", kind: "SCALE_1_3", weight: 10, order: 5 }
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
      subject: "Запрос на возврат из-за задержки доставки",
      status: "closed",
      tags: "возврат,доставка,ценный-клиент",
      customerName: "Мила Петрова",
      assigneeName: "Иван Петров",
      samplingReason: "Высокий риск: политика возврата",
      riskHint: "Возможное нарушение политики",
      openedAt: new Date("2026-04-25T10:00:00.000Z"),
      closedAt: new Date("2026-04-25T10:18:00.000Z"),
      messages: {
        create: [
          {
            externalId: "msg-1",
            participantType: "CUSTOMER",
            authorName: "Мила Петрова",
            body: "Доставка задерживается, я хочу возврат.",
            sentAt: new Date("2026-04-25T10:00:00.000Z")
          },
          {
            externalId: "msg-2",
            participantType: "HUMAN_AGENT",
            authorName: "Иван Петров",
            body: "Помогу разобраться. Заказ еще в пути, поэтому сегодня можем предложить бонусный кредит или оформить возврат после подтверждения перевозчика.",
            sentAt: new Date("2026-04-25T10:04:00.000Z")
          },
          {
            externalId: "msg-3",
            participantType: "CUSTOMER",
            authorName: "Мила Петрова",
            body: "Бонусный кредит подойдет, если заказ приедет на этой неделе.",
            sentAt: new Date("2026-04-25T10:09:00.000Z")
          },
          {
            externalId: "msg-4",
            participantType: "HUMAN_AGENT",
            authorName: "Иван Петров",
            body: "Я начислил бонусный кредит и создал задачу на проверку у перевозчика. Обновление придет до пятницы.",
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

  const apiToken = await prisma.apiToken.create({
    data: {
      workspaceId: workspace.id,
      name: "Локальный dev API",
      tokenPrefix: `${demoApiToken.slice(0, 7)}...`,
      tokenHash: hashApiToken(demoApiToken),
      scopes: "conversations:write,reviews:read"
    }
  });

  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      actorId: admin.id,
      action: "seed.created",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: JSON.stringify({
        analystId: analyst.id,
        scorecardId: scorecard.id,
        conversationId: conversation.id,
        apiTokenId: apiToken.id
      })
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
