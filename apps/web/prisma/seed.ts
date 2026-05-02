import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { demoApiToken } from "../src/lib/custom-api-docs";

const prisma = new PrismaClient();

function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.reviewQuota.deleteMany();
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
      name: "Проверяющий",
      role: "QA_ANALYST"
    }
  });

  const teamLead = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "lead@example.com",
      name: "Руководитель контроля качества",
      role: "TEAM_LEAD"
    }
  });

  const viewer = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "viewer@example.com",
      name: "Наблюдатель",
      role: "VIEWER"
    }
  });

  const scorecard = await prisma.scorecard.create({
    data: {
      workspaceId: workspace.id,
      name: "Цифровая поддержка",
      version: 1,
      criteria: {
        create: [
          { key: "accuracy", label: "Точность ответа", block: "Решение обращения", kind: "SCALE_1_3", weight: 20, order: 1 },
          { key: "resolution", label: "Полнота решения", block: "Решение обращения", kind: "SCALE_1_3", weight: 15, order: 2 },
          { key: "context", label: "Поиск информации и контекст", block: "Решение обращения", kind: "SCALE_1_3", weight: 10, order: 3 },
          { key: "template", label: "Корректность шаблона", block: "Решение обращения", kind: "SCALE_1_3", weight: 10, order: 4 },
          { key: "routing", label: "Маршрутизация обращения", block: "Процессы", kind: "SCALE_1_3", weight: 10, order: 5 },
          { key: "ticket_work", label: "Работа в обращении", block: "Процессы", kind: "SCALE_1_3", weight: 8, order: 6 },
          { key: "cross_team", label: "Взаимодействие со смежными отделами", block: "Процессы", kind: "SCALE_1_3", weight: 7, order: 7 },
          { key: "style", label: "Стиль и ясность", block: "Коммуникация", kind: "SCALE_1_3", weight: 8, order: 8 },
          { key: "empathy", label: "Эмпатия и клиентоориентированность", block: "Коммуникация", kind: "SCALE_1_3", weight: 7, order: 9 },
          { key: "grammar", label: "Грамотность", block: "Коммуникация", kind: "SCALE_1_3", weight: 5, order: 10 }
        ]
      }
    }
  });

  const activeCriteria = await prisma.scorecardCriterion.findMany({
    where: { scorecardId: scorecard.id },
    orderBy: { order: "asc" }
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
      qaStatus: "QUEUED",
      qaAssigneeId: analyst.id,
      qaAssigneeName: analyst.name,
      reviewDueAt: new Date("2026-05-05T12:00:00.000Z"),
      samplingReason: "Высокий риск: политика возврата",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "Возвраты",
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

  const accurateConversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      externalSource: "otrs_family",
      externalId: "OTRS-2451",
      externalUrl: "https://support.example.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=2451",
      channel: "TICKET",
      subject: "Консультация по статусу заявления",
      status: "closed",
      tags: "фгис,консультация,csat-5",
      customerName: "Анна Смирнова",
      assigneeName: "Ольга Иванова",
      qaStatus: "FINALIZED",
      qaAssigneeId: analyst.id,
      qaAssigneeName: analyst.name,
      reviewDueAt: new Date("2026-04-29T12:00:00.000Z"),
      samplingReason: "Плановая случайная выборка",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      riskHint: null,
      openedAt: new Date("2026-04-24T08:00:00.000Z"),
      closedAt: new Date("2026-04-24T08:45:00.000Z"),
      messages: {
        create: [
          {
            externalId: "otrs-2451-1",
            participantType: "CUSTOMER",
            authorName: "Анна Смирнова",
            body: "Подскажите, где посмотреть статус заявления?",
            sentAt: new Date("2026-04-24T08:00:00.000Z")
          },
          {
            externalId: "otrs-2451-2",
            participantType: "HUMAN_AGENT",
            authorName: "Ольга Иванова",
            body: "Статус можно проверить в разделе «Заявления». Я приложила ссылку на инструкцию и указала следующий шаг.",
            sentAt: new Date("2026-04-24T08:12:00.000Z")
          }
        ]
      }
    }
  });

  const criticalConversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      externalSource: "otrs_family",
      externalId: "OTRS-2452",
      externalUrl: "https://support.example.com/otrs/index.pl?Action=AgentTicketZoom;TicketID=2452",
      channel: "EMAIL",
      subject: "Ошибочная маршрутизация обращения",
      status: "closed",
      tags: "маршрутизация,критическая-ошибка,csat-1",
      customerName: "Сергей Волков",
      assigneeName: "Иван Петров",
      qaStatus: "FINALIZED",
      qaAssigneeId: analyst.id,
      qaAssigneeName: analyst.name,
      reviewDueAt: new Date("2026-05-01T12:00:00.000Z"),
      samplingReason: "Негативный CSAT и сигнал руководителя",
      samplingType: "LEAD_SIGNAL",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Возможна потеря времени из-за маршрутизации",
      openedAt: new Date("2026-04-28T09:00:00.000Z"),
      closedAt: new Date("2026-04-28T18:20:00.000Z"),
      messages: {
        create: [
          {
            externalId: "otrs-2452-1",
            participantType: "CUSTOMER",
            authorName: "Сергей Волков",
            body: "Обращение зависло, сроки ответа уже прошли.",
            sentAt: new Date("2026-04-28T09:00:00.000Z")
          },
          {
            externalId: "otrs-2452-2",
            participantType: "HUMAN_AGENT",
            authorName: "Иван Петров",
            body: "Ваш вопрос передан в другой отдел.",
            sentAt: new Date("2026-04-28T18:20:00.000Z")
          }
        ]
      }
    }
  });

  const previousConversation = await prisma.conversation.create({
    data: {
      workspaceId: workspace.id,
      externalSource: "demo_import",
      externalId: "conv-0901",
      externalUrl: "https://example.com/tickets/901",
      channel: "CHAT",
      subject: "Прошлый период: настройка уведомлений",
      status: "closed",
      tags: "уведомления,прошлый-период",
      customerName: "Дмитрий Орлов",
      assigneeName: "Ольга Иванова",
      qaStatus: "FINALIZED",
      qaAssigneeId: analyst.id,
      qaAssigneeName: analyst.name,
      reviewDueAt: new Date("2026-04-12T12:00:00.000Z"),
      samplingReason: "Плановая случайная выборка прошлого периода",
      samplingType: "RANDOM",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-04-10T10:00:00.000Z"),
      closedAt: new Date("2026-04-10T10:30:00.000Z"),
      messages: {
        create: [
          {
            externalId: "msg-prev-1",
            participantType: "CUSTOMER",
            authorName: "Дмитрий Орлов",
            body: "Не приходят уведомления.",
            sentAt: new Date("2026-04-10T10:00:00.000Z")
          },
          {
            externalId: "msg-prev-2",
            participantType: "HUMAN_AGENT",
            authorName: "Ольга Иванова",
            body: "Проверьте настройки уведомлений в профиле, я приложила инструкцию.",
            sentAt: new Date("2026-04-10T10:12:00.000Z")
          }
        ]
      }
    }
  });

  async function createFinalizedReview(input: {
    conversationId: string;
    totalScore: number;
    summary: string;
    category: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    ownerType?: "AGENT" | "PROCESS" | "PRODUCT" | "POLICY" | "AI_SYSTEM";
    finalizedAt: Date;
    criticalError?: boolean;
    criticalCategory?: string;
    needsReanswer?: boolean;
    reanswerStatus?: string;
    feedbackStatus?: string;
    appealStatus?: string;
    positiveNotes?: string;
  }) {
    const review = await prisma.review.create({
      data: {
        workspaceId: workspace.id,
        conversationId: input.conversationId,
        reviewerId: analyst.id,
        scorecardId: scorecard.id,
        reviewSource: "HUMAN",
        rubricVersion: scorecard.version,
        status: "FINALIZED",
        totalScore: input.criticalError ? 0 : input.totalScore,
        summary: input.summary,
        feedbackComment: input.summary,
        positiveNotes: input.positiveNotes ?? "Ответ структурирован, тон корректный.",
        instructionLinks: "Регламент КК, чек-лист оценки качества",
        feedbackStatus: input.feedbackStatus ?? "feedback_sent",
        appealStatus: input.appealStatus ?? "none",
        appealDueAt:
          input.appealStatus && input.appealStatus !== "none"
            ? new Date(input.finalizedAt.getTime() + 2 * 24 * 60 * 60 * 1000)
            : null,
        criticalError: input.criticalError ?? false,
        criticalCategory: input.criticalCategory,
        needsReanswer: input.needsReanswer ?? false,
        reanswerStatus: input.reanswerStatus ?? "not_needed",
        calibrationStatus: input.appealStatus === "calibration" ? "queued" : "none",
        calibrationNotes: input.appealStatus === "calibration" ? "Вынести на калибровку по маршрутизации." : "",
        finalizedAt: input.finalizedAt,
        scores: {
          create: activeCriteria.map((criterion) => ({
            criterionId: criterion.id,
            value: input.criticalError ? 1 : input.totalScore >= 90 ? 3 : input.totalScore >= 75 ? 2 : 1,
            passed: null,
            isNotApplicable: false,
            comment: "",
            evidenceMessageId: null
          }))
        },
        findings: {
          create: {
            ownerType: input.ownerType ?? "AGENT",
            category: input.category,
            rootCause: input.criticalError ? "Критическая ошибка процесса обработки." : "Точечное замечание по критерию.",
            riskLevel: input.riskLevel,
            evidenceSummary: input.summary,
            coachingAction:
              input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL"
                ? {
                    create: {
                      assignee: input.ownerType === "PROCESS" ? "Руководитель контроля качества" : "Проверяющий",
                      action: input.criticalError
                        ? "Провести разбор 1:1 в течение 3 рабочих дней."
                        : "Разобрать пример с оператором и закрепить корректную формулировку.",
                      dueAt: new Date(input.finalizedAt.getTime() + 3 * 24 * 60 * 60 * 1000)
                    }
                  }
                : undefined
          }
        }
      }
    });

    return review;
  }

  await createFinalizedReview({
    conversationId: accurateConversation.id,
    totalScore: 94,
    summary: "Оператор дал точный ответ, приложил инструкцию и обозначил следующий шаг.",
    category: "Полнота решения",
    riskLevel: "LOW",
    finalizedAt: new Date("2026-04-26T10:00:00.000Z")
  });

  await createFinalizedReview({
    conversationId: criticalConversation.id,
    totalScore: 62,
    summary: "Обращение было передано без достаточного пояснения и вышло за ожидаемый срок реакции.",
    category: "Неверная маршрутизация",
    riskLevel: "CRITICAL",
    ownerType: "PROCESS",
    finalizedAt: new Date("2026-04-30T11:00:00.000Z"),
    criticalError: true,
    criticalCategory: "Неверная маршрутизация с потерей времени",
    needsReanswer: true,
    reanswerStatus: "required",
    appealStatus: "open",
    positiveNotes: "Оператор сохранил корректный тон, но процесс обработки требует разбора."
  });

  await createFinalizedReview({
    conversationId: previousConversation.id,
    totalScore: 88,
    summary: "Прошлый период: ответ корректный, но не хватило персонализации.",
    category: "Персонализация",
    riskLevel: "MEDIUM",
    finalizedAt: new Date("2026-04-12T09:00:00.000Z")
  });

  await prisma.reviewQuota.createMany({
    data: [
      {
        workspaceId: workspace.id,
        assigneeName: "Иван Петров",
        supportLine: "2ЛП",
        periodStart: new Date("2026-04-22T00:00:00.000Z"),
        periodEnd: new Date("2026-05-21T23:59:59.999Z"),
        plannedCount: 20,
        dsatTargetPercent: 40,
        absenceDays: 0,
        note: "Повышенная доля DSAT из-за негативной динамики."
      },
      {
        workspaceId: workspace.id,
        assigneeName: "Ольга Иванова",
        supportLine: "1ЛП",
        periodStart: new Date("2026-04-22T00:00:00.000Z"),
        periodEnd: new Date("2026-05-21T23:59:59.999Z"),
        plannedCount: 20,
        dsatTargetPercent: 30,
        absenceDays: 0,
        note: "Плановая месячная норма."
      }
    ]
  });

  await prisma.integration.createMany({
    data: [
      {
        workspaceId: workspace.id,
        source: "custom_api",
        displayName: "Кастомный API",
        status: "active"
      },
      {
        workspaceId: workspace.id,
        source: "otrs_family",
        displayName: "Znuny / OTRS / OTOBO",
        status: "ready"
      },
      {
        workspaceId: workspace.id,
        source: "zendesk",
        displayName: "Zendesk",
        status: "ready"
      },
      {
        workspaceId: workspace.id,
        source: "intercom",
        displayName: "Intercom",
        status: "ready"
      },
      {
        workspaceId: workspace.id,
        source: "freshdesk",
        displayName: "Freshdesk",
        status: "ready"
      },
      {
        workspaceId: workspace.id,
        source: "hubspot",
        displayName: "HubSpot Service Hub",
        status: "ready"
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
        teamLeadId: teamLead.id,
        viewerId: viewer.id,
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
