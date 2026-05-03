import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { demoApiToken } from "../src/lib/custom-api-docs";

const prisma = new PrismaClient();

function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.reportSnapshot.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.backendJobEvent.deleteMany();
  await prisma.backendJob.deleteMany();
  await prisma.reviewEvent.deleteMany();
  await prisma.apiRateLimit.deleteMany();
  await prisma.authSession.deleteMany();
  await prisma.groupRoleMapping.deleteMany();
  await prisma.externalIdentity.deleteMany();
  await prisma.identityProvider.deleteMany();
  await prisma.integrationRun.deleteMany();
  await prisma.integrationCredential.deleteMany();
  await prisma.savedQueueView.deleteMany();
  await prisma.calibrationParticipant.deleteMany();
  await prisma.calibrationSessionItem.deleteMany();
  await prisma.calibrationSession.deleteMany();
  await prisma.reviewFeedbackEvent.deleteMany();
  await prisma.trainingAssignment.deleteMany();
  await prisma.samplingRule.deleteMany();
  await prisma.qualityKnowledgeEntry.deleteMany();
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

  const demoProvider = await prisma.identityProvider.create({
    data: {
      workspaceId: workspace.id,
      type: "DEMO",
      name: "Демо-вход",
      slug: "demo",
      status: "active",
      issuer: "local-demo",
      configJson: JSON.stringify({
        mode: "local_cookie",
        note: "Используется только для локального MVP."
      })
    }
  });

  const entraProvider = await prisma.identityProvider.create({
    data: {
      workspaceId: workspace.id,
      type: "MICROSOFT_ENTRA_ID",
      name: "Microsoft Entra ID / Active Directory",
      slug: "microsoft-entra-id",
      status: "draft",
      issuer: "https://login.microsoftonline.com/{tenantId}/v2.0",
      authorizationUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize",
      tokenUrl: "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token",
      jwksUrl: "https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys",
      scopes: "openid profile email",
      configJson: JSON.stringify({
        recommendedFlow: "authorization_code_pkce",
        roleSource: "app_roles",
        fallbackRoleSource: "assigned_groups",
        directorySync: "Microsoft Entra Connect or Cloud Sync"
      })
    }
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
      role: "QA_ANALYST",
      supportLine: "1ЛП",
      teamName: "Контроль качества"
    }
  });

  const teamLead = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "lead@example.com",
      name: "Руководитель контроля качества",
      role: "TEAM_LEAD",
      supportLine: "2ЛП",
      teamName: "Контроль качества"
    }
  });

  const supportAgent = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "ivan@example.com",
      name: "Иван Петров",
      role: "SUPPORT_AGENT",
      supportLine: "2ЛП",
      teamName: "ФГИС"
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

  await prisma.externalIdentity.createMany({
    data: [
      {
        userId: admin.id,
        providerId: demoProvider.id,
        providerSubject: "demo-admin",
        email: admin.email,
        displayName: admin.name
      },
      {
        userId: analyst.id,
        providerId: demoProvider.id,
        providerSubject: "demo-qa",
        email: analyst.email,
        displayName: analyst.name
      },
      {
        userId: teamLead.id,
        providerId: demoProvider.id,
        providerSubject: "demo-lead",
        email: teamLead.email,
        displayName: teamLead.name
      },
      {
        userId: supportAgent.id,
        providerId: demoProvider.id,
        providerSubject: "demo-agent",
        email: supportAgent.email,
        displayName: supportAgent.name
      },
      {
        userId: viewer.id,
        providerId: demoProvider.id,
        providerSubject: "demo-viewer",
        email: viewer.email,
        displayName: viewer.name
      }
    ]
  });

  await prisma.groupRoleMapping.createMany({
    data: [
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Admins",
        externalGroupName: "QC_Admins",
        role: "ADMIN",
        priority: 10
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_TeamLeads",
        externalGroupName: "QC_TeamLeads",
        role: "TEAM_LEAD",
        priority: 20
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        externalGroupName: "QC_Analysts",
        role: "QA_ANALYST",
        priority: 30
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        externalGroupName: "Support_Agents",
        role: "SUPPORT_AGENT",
        priority: 40
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Viewers",
        externalGroupName: "QC_Viewers",
        role: "VIEWER",
        priority: 50
      }
    ]
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

  const accurateReview = await createFinalizedReview({
    conversationId: accurateConversation.id,
    totalScore: 94,
    summary: "Оператор дал точный ответ, приложил инструкцию и обозначил следующий шаг.",
    category: "Полнота решения",
    riskLevel: "LOW",
    finalizedAt: new Date("2026-04-26T10:00:00.000Z")
  });

  const criticalReview = await createFinalizedReview({
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

  const previousReview = await createFinalizedReview({
    conversationId: previousConversation.id,
    totalScore: 88,
    summary: "Прошлый период: ответ корректный, но не хватило персонализации.",
    category: "Персонализация",
    riskLevel: "MEDIUM",
    finalizedAt: new Date("2026-04-12T09:00:00.000Z")
  });

  await prisma.reviewFeedbackEvent.createMany({
    data: [
      {
        reviewId: accurateReview.id,
        actorId: analyst.id,
        action: "feedback_sent",
        comment: "Итог проверки отправлен оператору."
      },
      {
        reviewId: criticalReview.id,
        actorId: teamLead.id,
        action: "appeal_opened",
        comment: "Нужен разбор критической маршрутизации."
      },
      {
        reviewId: previousReview.id,
        actorId: analyst.id,
        action: "feedback_sent",
        comment: "Проверка прошлого периода закрыта."
      }
    ]
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
        type: "custom_api",
        status: "active",
        baseUrl: "https://helpdesk.internal.example.com",
        configJson: JSON.stringify({ contract: "custom_conversation_v1" })
      },
      {
        workspaceId: workspace.id,
        source: "otrs_family",
        displayName: "Znuny / OTRS / OTOBO",
        type: "otrs_family",
        status: "ready",
        baseUrl: "https://support.example.com/znuny",
        configJson: JSON.stringify({ webService: "GenericTicketConnectorREST" })
      },
      {
        workspaceId: workspace.id,
        source: "zendesk",
        displayName: "Zendesk",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://company.zendesk.com",
        configJson: JSON.stringify({ endpoint: "/api/v2/tickets" })
      },
      {
        workspaceId: workspace.id,
        source: "intercom",
        displayName: "Intercom",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://api.intercom.io",
        configJson: JSON.stringify({ endpoint: "/conversations" })
      },
      {
        workspaceId: workspace.id,
        source: "freshdesk",
        displayName: "Freshdesk",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://company.freshdesk.com",
        configJson: JSON.stringify({ endpoint: "/api/v2/tickets" })
      },
      {
        workspaceId: workspace.id,
        source: "hubspot",
        displayName: "HubSpot Service Hub",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://api.hubapi.com",
        configJson: JSON.stringify({ endpoint: "/crm/v3/objects/tickets" })
      }
    ]
  });

  const integrations = await prisma.integration.findMany({ where: { workspaceId: workspace.id } });
  const otrsIntegration = integrations.find((integration) => integration.source === "otrs_family");
  const customIntegration = integrations.find((integration) => integration.source === "custom_api");

  await prisma.integrationRun.createMany({
    data: [
      {
        workspaceId: workspace.id,
        integrationId: otrsIntegration?.id,
        actorId: admin.id,
        source: "otrs_family",
        mode: "otrs_family",
        status: "dry_run_ok",
        dryRun: true,
        requestedLimit: 100,
        importedCount: 18,
        errorCount: 0,
        finishedAt: new Date("2026-05-02T12:00:00.000Z")
      },
      {
        workspaceId: workspace.id,
        integrationId: customIntegration?.id,
        actorId: admin.id,
        source: "custom_api",
        mode: "custom_api",
        status: "imported",
        dryRun: false,
        requestedLimit: 50,
        importedCount: 4,
        errorCount: 0,
        finishedAt: new Date("2026-05-02T12:10:00.000Z")
      }
    ]
  });

  await prisma.savedQueueView.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: analyst.id,
        name: "Мои просроченные",
        href: `/reviews?qaAssignee=${encodeURIComponent(analyst.name)}&due=overdue`,
        scope: "private",
        order: 1
      },
      {
        workspaceId: workspace.id,
        userId: null,
        name: "Критические за период",
        href: "/reviews?process=critical",
        scope: "workspace",
        order: 2
      },
      {
        workspaceId: workspace.id,
        userId: null,
        name: "Негативный CSAT",
        href: "/reviews?csatBucket=NEGATIVE",
        scope: "workspace",
        order: 3
      }
    ]
  });

  const calibrationSession = await prisma.calibrationSession.create({
    data: {
      workspaceId: workspace.id,
      ownerId: teamLead.id,
      scorecardId: scorecard.id,
      name: "Калибровка по маршрутизации",
      status: "active",
      dueAt: new Date("2026-05-06T12:00:00.000Z"),
      notes: "Сравнить оценку критической маршрутизации и полноты комментариев.",
      participants: {
        create: [
          { userId: analyst.id, status: "assigned" },
          { userId: teamLead.id, status: "assigned" }
        ]
      },
      items: {
        create: [
          {
            conversationId: criticalConversation.id,
            baselineReviewId: criticalReview.id
          },
          {
            conversationId: accurateConversation.id,
            baselineReviewId: accurateReview.id
          }
        ]
      }
    }
  });

  await prisma.samplingRule.createMany({
    data: [
      {
        workspaceId: workspace.id,
        name: "Негативный CSAT",
        type: "csat",
        conditionsJson: JSON.stringify({ csatBucket: "NEGATIVE" }),
        targetPercent: 100,
        priority: 10
      },
      {
        workspaceId: workspace.id,
        name: "Новые сотрудники",
        type: "new_hire",
        conditionsJson: JSON.stringify({ tag: "new_hire", minPercent: 50 }),
        targetPercent: 50,
        priority: 20
      },
      {
        workspaceId: workspace.id,
        name: "Случайная базовая выборка",
        type: "random",
        conditionsJson: JSON.stringify({ channels: ["CHAT", "EMAIL", "TICKET"] }),
        targetPercent: 10,
        priority: 100
      }
    ]
  });

  await prisma.qualityKnowledgeEntry.createMany({
    data: [
      {
        workspaceId: workspace.id,
        category: "Неверная маршрутизация",
        title: "Передача без объяснения клиенту",
        description: "Оператор передал обращение, но не указал причину, срок и следующий шаг.",
        recommendation: "Писать клиенту, куда передано обращение, почему это нужно и когда ждать обновление.",
        riskLevel: "CRITICAL",
        source: "Регламент КК"
      },
      {
        workspaceId: workspace.id,
        category: "Полнота решения",
        title: "Не указан следующий шаг",
        description: "Ответ формально корректный, но клиенту непонятно, что произойдет дальше.",
        recommendation: "Закрывать ответ конкретным следующим шагом, сроком или условием возврата.",
        riskLevel: "MEDIUM",
        source: "Чек-лист проверки"
      },
      {
        workspaceId: workspace.id,
        category: "Стиль и ясность",
        title: "Слишком общий шаблон",
        description: "Шаблон не адаптирован под ситуацию клиента.",
        recommendation: "Оставлять шаблонную структуру, но добавлять один персональный факт из обращения.",
        riskLevel: "LOW",
        source: "Калибровка"
      }
    ]
  });

  await prisma.trainingAssignment.create({
    data: {
      workspaceId: workspace.id,
      reviewId: criticalReview.id,
      assigneeId: supportAgent.id,
      assignedById: teamLead.id,
      assigneeName: supportAgent.name,
      title: "Разбор критической маршрутизации",
      description: "Разобрать пример OTRS-2452, закрепить правило передачи обращения и подготовить корректный переответ.",
      dueAt: new Date("2026-05-07T12:00:00.000Z"),
      status: "open"
    }
  });

  const apiToken = await prisma.apiToken.create({
    data: {
      workspaceId: workspace.id,
      name: "Локальный dev API",
      tokenPrefix: `${demoApiToken.slice(0, 7)}...`,
      tokenHash: hashApiToken(demoApiToken),
      scopes: "all"
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
        supportAgentId: supportAgent.id,
        viewerId: viewer.id,
        scorecardId: scorecard.id,
        conversationId: conversation.id,
        apiTokenId: apiToken.id,
        calibrationSessionId: calibrationSession.id
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
