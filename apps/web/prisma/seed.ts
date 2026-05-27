import { createHash } from "node:crypto";
import { PrismaClient, type ConversationChannel, type FindingOwnerType, type ReviewSource, type RiskLevel } from "@prisma/client";
import { demoApiToken } from "../src/lib/custom-api-docs";
import { buildTwoMonthReviewedConversationSeeds } from "./demo-review-seeds";

const prisma = new PrismaClient();

function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function isDemoAuthEnabled() {
  return process.env.QC_DEMO_AUTH === "enabled";
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
  await prisma.integrationRunItem.deleteMany();
  await prisma.integrationDiagnosticStep.deleteMany();
  await prisma.integrationDiagnosticRun.deleteMany();
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
    data: {
      name: "Демо Контроль качества",
      brandName: "QA Контроль",
      brandTagline: "Поддержка и проверки",
      brandMark: "QA",
      brandLogoAlt: "Логотип QA Контроль",
      brandPrimaryColor: "#3157d5",
      brandAccentColor: "#0f766e"
    }
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

  const seniorAnalyst = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "maria.qa@example.com",
      name: "Мария Кузнецова",
      role: "QA_ANALYST",
      supportLine: "2ЛП",
      teamName: "Контроль качества"
    }
  });

  const supportOlga = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "olga.agent@example.com",
      name: "Ольга Иванова",
      role: "SUPPORT_AGENT",
      supportLine: "1ЛП",
      teamName: "ФГИС"
    }
  });

  const supportDenis = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "denis.agent@example.com",
      name: "Денис Соколов",
      role: "SUPPORT_AGENT",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы"
    }
  });

  const supportElena = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: "elena.agent@example.com",
      name: "Елена Морозова",
      role: "SUPPORT_AGENT",
      supportLine: "2ЛП",
      teamName: "Личный кабинет"
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
        userId: seniorAnalyst.id,
        providerId: demoProvider.id,
        providerSubject: "demo-senior-qa",
        email: seniorAnalyst.email,
        displayName: seniorAnalyst.name
      },
      {
        userId: supportOlga.id,
        providerId: demoProvider.id,
        providerSubject: "demo-agent-olga",
        email: supportOlga.email,
        displayName: supportOlga.name
      },
      {
        userId: supportDenis.id,
        providerId: demoProvider.id,
        providerSubject: "demo-agent-denis",
        email: supportDenis.email,
        displayName: supportDenis.name
      },
      {
        userId: supportElena.id,
        providerId: demoProvider.id,
        providerSubject: "demo-agent-elena",
        email: supportElena.email,
        displayName: supportElena.name
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
      }
    ]
  });

  await prisma.identityGroup.createMany({
    data: [
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Admins",
        externalGroupName: "QC_Admins",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 1 }),
        lastSyncAt: new Date("2026-05-18T09:10:00.000Z")
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_TeamLeads",
        externalGroupName: "QC_TeamLeads",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 1 }),
        lastSyncAt: new Date("2026-05-18T09:10:00.000Z")
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        externalGroupName: "QC_Analysts",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 2 }),
        lastSyncAt: new Date("2026-05-18T09:10:00.000Z")
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        externalGroupName: "Support_Agents",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 4 }),
        lastSyncAt: new Date("2026-05-18T09:10:00.000Z")
      }
    ]
  });

  await prisma.userIdentityGroup.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: admin.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Admins",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: teamLead.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_TeamLeads",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: analyst.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: seniorAnalyst.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: supportAgent.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: supportOlga.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: supportDenis.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: supportElena.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: new Date("2026-05-18T09:12:00.000Z")
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

  type ReviewedConversationSeed = {
    externalSource: string;
    externalId: string;
    externalUrl?: string;
    channel: ConversationChannel;
    subject: string;
    tags: string;
    customerName: string;
    assigneeName: string;
    reviewerId: string;
    reviewDueAt: Date;
    samplingReason: string;
    samplingType: string;
    csatScore: number | null;
    csatBucket: string;
    supportLine: string;
    teamName: string;
    riskHint?: string | null;
    openedAt: Date;
    closedAt: Date;
    customerMessage: string;
    customerFollowUp?: string;
    agentMessage: string;
    totalScore: number;
    summary: string;
    category: string;
    riskLevel: RiskLevel;
    ownerType?: FindingOwnerType;
    finalizedAt: Date;
    criticalError?: boolean;
    criticalCategory?: string;
    needsReanswer?: boolean;
    reanswerStatus?: string;
    feedbackStatus?: string;
    appealStatus?: string;
    positiveNotes?: string;
  };

  const reviewerNameById = new Map([
    [analyst.id, analyst.name],
    [teamLead.id, teamLead.name],
    [seniorAnalyst.id, seniorAnalyst.name]
  ]);

  function scoreValuesFor(totalScore: number) {
    const pattern =
      totalScore >= 95
        ? [3, 3, 3, 3, 3, 3, 3, 3, 3, 3]
        : totalScore >= 90
          ? [3, 3, 3, 2, 3, 3, 2, 3, 3, 2]
          : totalScore >= 84
            ? [3, 3, 2, 2, 3, 2, 2, 3, 2, 3]
            : totalScore >= 75
              ? [2, 3, 2, 2, 2, 2, 2, 3, 2, 2]
              : totalScore >= 65
                ? [2, 2, 1, 2, 2, 1, 2, 2, 1, 2]
                : totalScore >= 50
                  ? [2, 1, 1, 2, 1, 1, 2, 1, 1, 2]
                  : [1, 1, 1, 1, 2, 1, 1, 1, 1, 1];

    return activeCriteria.map((_, index) => pattern[index % pattern.length]);
  }

  async function createFinalizedReview(input: {
    conversationId: string;
    reviewerId?: string;
    reviewSource?: ReviewSource;
    totalScore: number;
    summary: string;
    category: string;
    riskLevel: RiskLevel;
    ownerType?: FindingOwnerType;
    finalizedAt: Date;
    criticalError?: boolean;
    criticalCategory?: string;
    needsReanswer?: boolean;
    reanswerStatus?: string;
    feedbackStatus?: string;
    appealStatus?: string;
    positiveNotes?: string;
    scoreValueOverrides?: number[];
  }) {
    const review = await prisma.review.create({
      data: {
        workspaceId: workspace.id,
        conversationId: input.conversationId,
        reviewerId: input.reviewerId ?? analyst.id,
        scorecardId: scorecard.id,
        reviewSource: input.reviewSource ?? "HUMAN",
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
          create: activeCriteria.map((criterion, index) => ({
            criterionId: criterion.id,
            value: input.criticalError ? 1 : input.scoreValueOverrides?.[index] ?? (input.totalScore >= 90 ? 3 : input.totalScore >= 75 ? 2 : 1),
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

  async function createReviewedConversation(input: ReviewedConversationSeed) {
    const reviewerName = reviewerNameById.get(input.reviewerId) ?? analyst.name;
    const messages = [
      {
        externalId: `${input.externalId}-msg-1`,
        participantType: "CUSTOMER" as const,
        authorName: input.customerName,
        body: input.customerMessage,
        sentAt: input.openedAt
      },
      ...(input.customerFollowUp
        ? [
            {
              externalId: `${input.externalId}-msg-2`,
              participantType: "CUSTOMER" as const,
              authorName: input.customerName,
              body: input.customerFollowUp,
              sentAt: new Date(input.openedAt.getTime() + 8 * 60 * 1000)
            }
          ]
        : []),
      {
        externalId: `${input.externalId}-msg-agent`,
        participantType: "HUMAN_AGENT" as const,
        authorName: input.assigneeName,
        body: input.agentMessage,
        sentAt: input.closedAt
      }
    ];

    const createdConversation = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        externalSource: input.externalSource,
        externalId: input.externalId,
        externalUrl: input.externalUrl ?? `https://example.com/tickets/${encodeURIComponent(input.externalId)}`,
        channel: input.channel,
        subject: input.subject,
        status: "closed",
        tags: input.tags,
        customerName: input.customerName,
        assigneeName: input.assigneeName,
        qaStatus: "FINALIZED",
        qaAssigneeId: input.reviewerId,
        qaAssigneeName: reviewerName,
        reviewDueAt: input.reviewDueAt,
        samplingReason: input.samplingReason,
        samplingType: input.samplingType,
        csatScore: input.csatScore,
        csatBucket: input.csatBucket,
        supportLine: input.supportLine,
        teamName: input.teamName,
        riskHint: input.riskHint ?? null,
        openedAt: input.openedAt,
        closedAt: input.closedAt,
        messages: {
          create: messages
        }
      }
    });

    const review = await createFinalizedReview({
      conversationId: createdConversation.id,
      reviewerId: input.reviewerId,
      totalScore: input.totalScore,
      summary: input.summary,
      category: input.category,
      riskLevel: input.riskLevel,
      ownerType: input.ownerType,
      finalizedAt: input.finalizedAt,
      criticalError: input.criticalError,
      criticalCategory: input.criticalCategory,
      needsReanswer: input.needsReanswer,
      reanswerStatus: input.reanswerStatus,
      feedbackStatus: input.feedbackStatus,
      appealStatus: input.appealStatus,
      positiveNotes: input.positiveNotes,
      scoreValueOverrides: scoreValuesFor(input.totalScore)
    });

    return { conversation: createdConversation, review };
  }

  async function createCalibrationReview(input: {
    conversationId: string;
    reviewerId: string;
    totalScore: number;
    summary: string;
    finalizedAt: Date;
    notes: string;
  }) {
    return prisma.review.create({
      data: {
        workspaceId: workspace.id,
        conversationId: input.conversationId,
        reviewerId: input.reviewerId,
        scorecardId: scorecard.id,
        reviewSource: "CALIBRATION",
        rubricVersion: scorecard.version,
        status: "FINALIZED",
        totalScore: input.totalScore,
        summary: input.summary,
        feedbackComment: input.summary,
        positiveNotes: "Калибровочная оценка зафиксирована для сравнения трактовки критериев.",
        instructionLinks: "Калибровочная сессия",
        feedbackStatus: "new",
        appealStatus: "none",
        criticalError: false,
        needsReanswer: false,
        reanswerStatus: "not_needed",
        calibrationStatus: "completed",
        calibrationNotes: input.notes,
        finalizedAt: input.finalizedAt,
        scores: {
          create: activeCriteria.map((criterion, index) => ({
            criterionId: criterion.id,
            value: scoreValuesFor(input.totalScore)[index],
            passed: null,
            isNotApplicable: false,
            comment: input.notes,
            evidenceMessageId: null
          }))
        }
      }
    });
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

  const currentPeriodReviewedConversations: ReviewedConversationSeed[] = [
    {
      externalSource: "otrs_family",
      externalId: "OTRS-2601",
      channel: "TICKET",
      subject: "Текущий период: уточнение статуса льготы",
      tags: "льготы,статус,csat-5",
      customerName: "Наталья Белова",
      assigneeName: supportOlga.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-24T12:00:00.000Z"),
      samplingReason: "Плановая выборка текущего периода",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-05-22T08:15:00.000Z"),
      closedAt: new Date("2026-05-22T08:42:00.000Z"),
      finalizedAt: new Date("2026-05-22T11:00:00.000Z"),
      customerMessage: "Не вижу статус заявления на льготу в личном кабинете.",
      agentMessage: "Оператор указал точный раздел, срок обновления и приложил короткую инструкцию.",
      totalScore: 96,
      summary: "Точный ответ со следующим шагом и понятным сроком ожидания.",
      category: "Полнота решения",
      riskLevel: "LOW",
      feedbackStatus: "acknowledged",
      positiveNotes: "Хорошо объяснен путь клиента без лишнего шаблона."
    },
    {
      externalSource: "zendesk",
      externalId: "ZD-7001",
      channel: "EMAIL",
      subject: "Сбой авторизации в личном кабинете",
      tags: "авторизация,dsat,технический-сбой",
      customerName: "Аркадий Лебедев",
      assigneeName: supportDenis.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-24T12:00:00.000Z"),
      samplingReason: "Негативный CSAT после технического сбоя",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Клиент не получил объяснение причины сбоя",
      openedAt: new Date("2026-05-22T09:10:00.000Z"),
      closedAt: new Date("2026-05-22T09:55:00.000Z"),
      finalizedAt: new Date("2026-05-22T13:20:00.000Z"),
      customerMessage: "После смены пароля не могу войти, код не приходит.",
      customerFollowUp: "Мне важно успеть оплатить счет сегодня.",
      agentMessage: "Оператор восстановил доступ, но не объяснил клиенту срок доставки кода.",
      totalScore: 82,
      summary: "Решение найдено, но ожидания по срокам кода описаны недостаточно.",
      category: "Ожидания клиента",
      riskLevel: "MEDIUM",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "intercom",
      externalId: "INT-5101",
      channel: "MESSENGER",
      subject: "Не применился промокод при оплате",
      tags: "промокод,оплата,appeal",
      customerName: "Полина Сафонова",
      assigneeName: supportElena.name,
      reviewerId: teamLead.id,
      reviewDueAt: new Date("2026-05-25T12:00:00.000Z"),
      samplingReason: "Сигнал руководителя по компенсациям",
      samplingType: "LEAD_SIGNAL",
      csatScore: 3,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      riskHint: "Спорная компенсация по акции",
      openedAt: new Date("2026-05-22T10:05:00.000Z"),
      closedAt: new Date("2026-05-22T10:37:00.000Z"),
      finalizedAt: new Date("2026-05-22T14:10:00.000Z"),
      customerMessage: "Промокод активен, но сумма заказа не изменилась.",
      agentMessage: "Оператор предложил общий шаблон и не проверил условия акции в заказе.",
      totalScore: 74,
      summary: "Нужно было сверить условия акции и дать конкретный результат проверки.",
      category: "Проверка условий",
      riskLevel: "HIGH",
      ownerType: "POLICY",
      feedbackStatus: "appeal",
      appealStatus: "open",
      needsReanswer: true,
      reanswerStatus: "requested"
    },
    {
      externalSource: "freshdesk",
      externalId: "FD-3201",
      channel: "CHAT",
      subject: "Новичок: перенос записи на услугу",
      tags: "new_hire,запись,csat-5",
      customerName: "Марина Котова",
      assigneeName: supportAgent.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-25T12:00:00.000Z"),
      samplingReason: "Контроль новичка после смены сценария",
      samplingType: "NEW_HIRE",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-05-22T12:00:00.000Z"),
      closedAt: new Date("2026-05-22T12:28:00.000Z"),
      finalizedAt: new Date("2026-05-23T08:45:00.000Z"),
      customerMessage: "Нужно перенести запись на следующую неделю.",
      agentMessage: "Оператор подтвердил новую дату, проверил уведомления и закрыл вопрос.",
      totalScore: 89,
      summary: "Хороший результат для новичка: корректная проверка записи и уведомлений.",
      category: "Работа в обращении",
      riskLevel: "LOW",
      feedbackStatus: "acknowledged"
    },
    {
      externalSource: "hubspot",
      externalId: "HS-4301",
      channel: "TICKET",
      subject: "Клиент не получил закрывающие документы",
      tags: "документы,dsat,переответ",
      customerName: "Роман Ильин",
      assigneeName: supportOlga.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-25T12:00:00.000Z"),
      samplingReason: "Негативный CSAT по документам",
      samplingType: "DSAT",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      riskHint: "Риск повторного обращения из-за документов",
      openedAt: new Date("2026-05-23T07:50:00.000Z"),
      closedAt: new Date("2026-05-23T08:35:00.000Z"),
      finalizedAt: new Date("2026-05-23T10:15:00.000Z"),
      customerMessage: "Закрывающие документы не пришли, бухгалтерия ждет сегодня.",
      customerFollowUp: "Без документов платеж не проведут.",
      agentMessage: "Оператор указал общий срок, но не проверил статус отправки документов.",
      totalScore: 68,
      summary: "Не хватило проверки фактического статуса и конкретного срока отправки.",
      category: "Полнота решения",
      riskLevel: "HIGH",
      needsReanswer: true,
      reanswerStatus: "required",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "demo_import",
      externalId: "conv-2101",
      channel: "CHAT",
      subject: "Повторное обращение по начислению бонусов",
      tags: "бонусы,повторное,csat-4",
      customerName: "Егор Селезнев",
      assigneeName: supportDenis.name,
      reviewerId: teamLead.id,
      reviewDueAt: new Date("2026-05-26T12:00:00.000Z"),
      samplingReason: "Повторное обращение без негатива",
      samplingType: "RANDOM",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      openedAt: new Date("2026-05-23T11:10:00.000Z"),
      closedAt: new Date("2026-05-23T11:25:00.000Z"),
      finalizedAt: new Date("2026-05-23T15:00:00.000Z"),
      customerMessage: "Бонусы обещали вчера, но баланс не изменился.",
      agentMessage: "Оператор проверил начисление, назвал точное время обновления и закрыл ожидание.",
      totalScore: 93,
      summary: "Сильная проверка фактов и понятный срок обновления баланса.",
      category: "Точность ответа",
      riskLevel: "LOW",
      feedbackStatus: "acknowledged"
    },
    {
      externalSource: "otrs_family",
      externalId: "OTRS-2602",
      channel: "EMAIL",
      subject: "Неверный отдел для технической ошибки",
      tags: "маршрутизация,critical,переответ",
      customerName: "Илья Макаров",
      assigneeName: supportAgent.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-26T12:00:00.000Z"),
      samplingReason: "Низкая оценка и сигнал руководителя",
      samplingType: "LOW_SCORE",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Потеря SLA из-за неверной маршрутизации",
      openedAt: new Date("2026-05-23T13:05:00.000Z"),
      closedAt: new Date("2026-05-23T17:40:00.000Z"),
      finalizedAt: new Date("2026-05-24T09:30:00.000Z"),
      customerMessage: "Ошибка не исправлена, меня переводят между отделами.",
      agentMessage: "Оператор передал обращение в неверную очередь без объяснения причины.",
      totalScore: 58,
      summary: "Критическая маршрутизация: клиент не получил владельца и срок исправления.",
      category: "Неверная маршрутизация",
      riskLevel: "CRITICAL",
      ownerType: "PROCESS",
      criticalError: true,
      criticalCategory: "Неверная маршрутизация с потерей SLA",
      needsReanswer: true,
      reanswerStatus: "requested",
      feedbackStatus: "appeal",
      appealStatus: "calibration"
    },
    {
      externalSource: "zendesk",
      externalId: "ZD-7002",
      channel: "CHAT",
      subject: "Уточнение тарифа после изменения условий",
      tags: "тариф,manual,no-csat",
      customerName: "Вера Громова",
      assigneeName: supportElena.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-27T12:00:00.000Z"),
      samplingReason: "Ручное добавление из отчета по тарифам",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      openedAt: new Date("2026-05-24T08:20:00.000Z"),
      closedAt: new Date("2026-05-24T08:52:00.000Z"),
      finalizedAt: new Date("2026-05-24T11:45:00.000Z"),
      customerMessage: "Почему тариф стал дороже после продления?",
      agentMessage: "Оператор объяснил новые условия, но не дал ссылку на публичный документ.",
      totalScore: 85,
      summary: "Ответ понятный, но ссылку на обновленные условия нужно добавлять всегда.",
      category: "Корректность шаблона",
      riskLevel: "MEDIUM",
      feedbackStatus: "new"
    },
    {
      externalSource: "intercom",
      externalId: "INT-5102",
      channel: "MESSENGER",
      subject: "Долгое ожидание ответа в мессенджере",
      tags: "скорость,dsat,corrected",
      customerName: "Кирилл Астахов",
      assigneeName: supportAgent.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-27T12:00:00.000Z"),
      samplingReason: "Негативный CSAT после задержки ответа",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Нарушение ожиданий по времени ответа",
      openedAt: new Date("2026-05-24T09:30:00.000Z"),
      closedAt: new Date("2026-05-24T15:20:00.000Z"),
      finalizedAt: new Date("2026-05-24T16:10:00.000Z"),
      customerMessage: "Я жду ответа уже несколько часов.",
      agentMessage: "Оператор решил вопрос, но не признал задержку и не обозначил причину ожидания.",
      totalScore: 57,
      summary: "Нужна формулировка про задержку и короткое объяснение следующего шага.",
      category: "Стиль и ясность",
      riskLevel: "HIGH",
      needsReanswer: true,
      reanswerStatus: "completed",
      feedbackStatus: "corrected",
      appealStatus: "corrected"
    },
    {
      externalSource: "freshdesk",
      externalId: "FD-3202",
      channel: "TICKET",
      subject: "Некорректная ссылка в инструкции",
      tags: "инструкция,low_score,csat-3",
      customerName: "Оксана Миронова",
      assigneeName: supportOlga.name,
      reviewerId: teamLead.id,
      reviewDueAt: new Date("2026-05-27T12:00:00.000Z"),
      samplingReason: "Низкая оценка критерия по шаблону",
      samplingType: "LOW_SCORE",
      csatScore: 3,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-05-24T12:15:00.000Z"),
      closedAt: new Date("2026-05-24T12:45:00.000Z"),
      finalizedAt: new Date("2026-05-25T08:20:00.000Z"),
      customerMessage: "Ссылка из ответа ведет на старую инструкцию.",
      agentMessage: "Оператор быстро заменил ссылку, но первичный ответ был без проверки актуальности.",
      totalScore: 78,
      summary: "Ошибка не критичная, но проверка актуальности инструкции обязательна.",
      category: "Корректность шаблона",
      riskLevel: "MEDIUM",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "hubspot",
      externalId: "HS-4302",
      channel: "EMAIL",
      subject: "Успешное закрытие сложного запроса",
      tags: "сложный-запрос,csat-5,best-practice",
      customerName: "Лев Панин",
      assigneeName: supportDenis.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-28T12:00:00.000Z"),
      samplingReason: "Плановая выборка сложных обращений",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      openedAt: new Date("2026-05-25T07:45:00.000Z"),
      closedAt: new Date("2026-05-25T09:05:00.000Z"),
      finalizedAt: new Date("2026-05-25T10:35:00.000Z"),
      customerMessage: "Нужно согласовать несколько изменений в договоре.",
      customerFollowUp: "Важно, чтобы все правки были в одном письме.",
      agentMessage: "Оператор собрал контекст, согласовал правки и отправил клиенту единый понятный итог.",
      totalScore: 99,
      summary: "Отличный пример сложного обращения: факты, тон и следующий шаг оформлены без потерь.",
      category: "Сложный кейс",
      riskLevel: "LOW",
      feedbackStatus: "acknowledged",
      positiveNotes: "Можно использовать как эталон для обучения."
    },
    {
      externalSource: "demo_import",
      externalId: "conv-2102",
      channel: "CHAT",
      subject: "Ручной аудит шаблонного ответа",
      tags: "manual,шаблон,переответ",
      customerName: "Светлана Мельникова",
      assigneeName: supportElena.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-28T12:00:00.000Z"),
      samplingReason: "Ручное добавление после разбора шаблонов",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      riskHint: "Шаблон не отвечает на конкретный вопрос",
      openedAt: new Date("2026-05-25T11:30:00.000Z"),
      closedAt: new Date("2026-05-25T11:55:00.000Z"),
      finalizedAt: new Date("2026-05-25T14:30:00.000Z"),
      customerMessage: "В ответе не указано, какие документы нужны именно для моей ситуации.",
      agentMessage: "Оператор отправил общий шаблон без привязки к типу заявления клиента.",
      totalScore: 62,
      summary: "Шаблон нужно персонализировать и явно перечислять документы под сценарий клиента.",
      category: "Персонализация",
      riskLevel: "HIGH",
      needsReanswer: true,
      reanswerStatus: "required",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "zendesk",
      externalId: "ZD-7003",
      channel: "TICKET",
      subject: "Просьба удалить персональные данные",
      tags: "персональные-данные,lead_signal",
      customerName: "Алина Романова",
      assigneeName: supportAgent.name,
      reviewerId: teamLead.id,
      reviewDueAt: new Date("2026-05-29T12:00:00.000Z"),
      samplingReason: "Сигнал руководителя по персональным данным",
      samplingType: "LEAD_SIGNAL",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-05-26T07:30:00.000Z"),
      closedAt: new Date("2026-05-26T08:10:00.000Z"),
      finalizedAt: new Date("2026-05-26T09:20:00.000Z"),
      customerMessage: "Хочу удалить старые персональные данные из профиля.",
      agentMessage: "Оператор корректно описал процедуру, проверил право клиента и указал срок обработки.",
      totalScore: 91,
      summary: "Корректная работа с чувствительным запросом и понятная инструкция клиенту.",
      category: "Политика данных",
      riskLevel: "LOW",
      ownerType: "POLICY",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "otrs_family",
      externalId: "OTRS-2603",
      channel: "EMAIL",
      subject: "Неполная консультация по срокам рассмотрения",
      tags: "сроки,dsat,appeal",
      customerName: "Петр Жуков",
      assigneeName: supportOlga.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-29T12:00:00.000Z"),
      samplingReason: "Негативный CSAT и низкая оценка полноты",
      samplingType: "DSAT",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      riskHint: "Клиент может пропустить срок подачи документов",
      openedAt: new Date("2026-05-26T10:00:00.000Z"),
      closedAt: new Date("2026-05-26T10:24:00.000Z"),
      finalizedAt: new Date("2026-05-26T12:05:00.000Z"),
      customerMessage: "Сколько дней рассматривают заявление и что делать, если срок прошел?",
      agentMessage: "Оператор назвал общий срок, но не описал действия при просрочке.",
      totalScore: 49,
      summary: "Консультация неполная: отсутствует сценарий просрочки и ссылка на регламент.",
      category: "Полнота решения",
      riskLevel: "CRITICAL",
      needsReanswer: true,
      reanswerStatus: "requested",
      feedbackStatus: "appeal",
      appealStatus: "open"
    }
  ];

  const previousPeriodReviewedConversations: ReviewedConversationSeed[] = [
    {
      externalSource: "zendesk",
      externalId: "ZD-6901",
      channel: "EMAIL",
      subject: "Прошлый период: возврат ошибочного платежа",
      tags: "прошлый-период,возврат,csat-5",
      customerName: "Юлия Нестерова",
      assigneeName: supportDenis.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-05T12:00:00.000Z"),
      samplingReason: "Плановая выборка прошлого периода",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      openedAt: new Date("2026-05-03T08:00:00.000Z"),
      closedAt: new Date("2026-05-03T08:44:00.000Z"),
      finalizedAt: new Date("2026-05-03T13:00:00.000Z"),
      customerMessage: "Платеж ушел дважды, нужен возврат.",
      agentMessage: "Оператор проверил платеж, оформил возврат и указал срок поступления.",
      totalScore: 90,
      summary: "Возврат оформлен корректно, клиент получил срок и подтверждение.",
      category: "Точность ответа",
      riskLevel: "LOW",
      feedbackStatus: "acknowledged"
    },
    {
      externalSource: "otrs_family",
      externalId: "OTRS-2501",
      channel: "TICKET",
      subject: "Прошлый период: консультация по уведомлениям",
      tags: "прошлый-период,уведомления",
      customerName: "Галина Фролова",
      assigneeName: supportOlga.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-07T12:00:00.000Z"),
      samplingReason: "Плановая выборка обращений ФГИС",
      samplingType: "RANDOM",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-05-05T09:20:00.000Z"),
      closedAt: new Date("2026-05-05T09:58:00.000Z"),
      finalizedAt: new Date("2026-05-05T14:10:00.000Z"),
      customerMessage: "Уведомления приходят не на тот адрес.",
      agentMessage: "Оператор объяснил смену адреса, но не проверил подтверждение почты.",
      totalScore: 83,
      summary: "Ответ полезный, но проверка подтверждения почты должна быть явной.",
      category: "Работа в обращении",
      riskLevel: "MEDIUM",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "intercom",
      externalId: "INT-5001",
      channel: "MESSENGER",
      subject: "Прошлый период: перенос даты доставки",
      tags: "прошлый-период,доставка",
      customerName: "Михаил Серов",
      assigneeName: supportElena.name,
      reviewerId: teamLead.id,
      reviewDueAt: new Date("2026-05-09T12:00:00.000Z"),
      samplingReason: "Случайная выборка мессенджера",
      samplingType: "RANDOM",
      csatScore: 3,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      openedAt: new Date("2026-05-07T10:10:00.000Z"),
      closedAt: new Date("2026-05-07T10:35:00.000Z"),
      finalizedAt: new Date("2026-05-07T15:20:00.000Z"),
      customerMessage: "Можно перенести доставку на пятницу?",
      agentMessage: "Оператор перенес дату, но не сообщил клиенту окно доставки.",
      totalScore: 77,
      summary: "Не хватило финального подтверждения окна доставки.",
      category: "Следующий шаг",
      riskLevel: "MEDIUM",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "freshdesk",
      externalId: "FD-3101",
      channel: "CHAT",
      subject: "Прошлый период: ошибка при загрузке файла",
      tags: "прошлый-период,файл,low_score",
      customerName: "Денис Яковлев",
      assigneeName: supportAgent.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-11T12:00:00.000Z"),
      samplingReason: "Низкая оценка по техническому сценарию",
      samplingType: "LOW_SCORE",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Клиент не получил обходной путь",
      openedAt: new Date("2026-05-09T07:40:00.000Z"),
      closedAt: new Date("2026-05-09T08:12:00.000Z"),
      finalizedAt: new Date("2026-05-09T12:35:00.000Z"),
      customerMessage: "Файл не загружается, форма выдает ошибку.",
      agentMessage: "Оператор попросил попробовать позже и не предложил обходной вариант.",
      totalScore: 71,
      summary: "Нужен обходной сценарий и сбор технических деталей для второй линии.",
      category: "Маршрутизация обращения",
      riskLevel: "HIGH",
      needsReanswer: true,
      reanswerStatus: "completed",
      feedbackStatus: "corrected",
      appealStatus: "corrected"
    },
    {
      externalSource: "hubspot",
      externalId: "HS-4201",
      channel: "TICKET",
      subject: "Прошлый период: неполный ответ по счету",
      tags: "прошлый-период,счет,dsat",
      customerName: "Екатерина Лапина",
      assigneeName: supportDenis.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-13T12:00:00.000Z"),
      samplingReason: "Негативный CSAT по финансовому обращению",
      samplingType: "DSAT",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Риск задержки оплаты",
      openedAt: new Date("2026-05-11T09:00:00.000Z"),
      closedAt: new Date("2026-05-11T09:35:00.000Z"),
      finalizedAt: new Date("2026-05-11T13:45:00.000Z"),
      customerMessage: "В счете неверная сумма, нужна расшифровка.",
      agentMessage: "Оператор переслал счет без расшифровки и проверки позиции.",
      totalScore: 65,
      summary: "Ответ не закрывает финансовый вопрос: нужна расшифровка и проверка суммы.",
      category: "Полнота решения",
      riskLevel: "HIGH",
      needsReanswer: true,
      reanswerStatus: "required",
      feedbackStatus: "acknowledged",
      appealStatus: "confirmed"
    },
    {
      externalSource: "demo_import",
      externalId: "conv-2001",
      channel: "CHAT",
      subject: "Прошлый период: общий шаблон без проверки",
      tags: "прошлый-период,шаблон",
      customerName: "Семен Власов",
      assigneeName: supportElena.name,
      reviewerId: teamLead.id,
      reviewDueAt: new Date("2026-05-16T12:00:00.000Z"),
      samplingReason: "Ручной разбор шаблонов",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      openedAt: new Date("2026-05-14T11:25:00.000Z"),
      closedAt: new Date("2026-05-14T11:50:00.000Z"),
      finalizedAt: new Date("2026-05-14T16:20:00.000Z"),
      customerMessage: "Ответ не подходит к моему типу заявки.",
      agentMessage: "Оператор выбрал общий шаблон и не уточнил тип заявки.",
      totalScore: 58,
      summary: "Нужно уточнять сценарий клиента перед отправкой шаблона.",
      category: "Персонализация",
      riskLevel: "HIGH",
      feedbackStatus: "feedback_sent"
    },
    {
      externalSource: "zendesk",
      externalId: "ZD-6902",
      channel: "EMAIL",
      subject: "Прошлый период: потерянный следующий шаг",
      tags: "прошлый-период,critical",
      customerName: "Ирина Гордеева",
      assigneeName: supportAgent.name,
      reviewerId: analyst.id,
      reviewDueAt: new Date("2026-05-20T12:00:00.000Z"),
      samplingReason: "Повторное обращение после негативного ответа",
      samplingType: "DSAT",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Клиент остался без следующего шага",
      openedAt: new Date("2026-05-18T08:55:00.000Z"),
      closedAt: new Date("2026-05-18T09:18:00.000Z"),
      finalizedAt: new Date("2026-05-18T12:00:00.000Z"),
      customerMessage: "Что мне делать дальше, если заявление отклонили?",
      agentMessage: "Оператор ответил общей фразой и не дал порядок действий.",
      totalScore: 44,
      summary: "Ответ не содержит следующего шага и требует переответа.",
      category: "Следующий шаг",
      riskLevel: "CRITICAL",
      needsReanswer: true,
      reanswerStatus: "requested",
      feedbackStatus: "appeal",
      appealStatus: "open"
    },
    {
      externalSource: "otrs_family",
      externalId: "OTRS-2502",
      channel: "TICKET",
      subject: "Прошлый период: корректное закрытие эскалации",
      tags: "прошлый-период,эскалация,csat-4",
      customerName: "Владимир Антонов",
      assigneeName: supportOlga.name,
      reviewerId: seniorAnalyst.id,
      reviewDueAt: new Date("2026-05-21T12:00:00.000Z"),
      samplingReason: "Плановая проверка эскалаций",
      samplingType: "RANDOM",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: new Date("2026-05-20T07:35:00.000Z"),
      closedAt: new Date("2026-05-20T08:05:00.000Z"),
      finalizedAt: new Date("2026-05-20T11:30:00.000Z"),
      customerMessage: "Проверьте, передали ли мою эскалацию ответственному отделу.",
      agentMessage: "Оператор подтвердил владельца, срок и канал обновления.",
      totalScore: 87,
      summary: "Эскалация закрыта корректно, но можно точнее указывать основание передачи.",
      category: "Маршрутизация обращения",
      riskLevel: "LOW",
      feedbackStatus: "acknowledged"
    }
  ];

  const generatedTwoMonthReviewedConversations: ReviewedConversationSeed[] = buildTwoMonthReviewedConversationSeeds({
    analystId: analyst.id,
    teamLeadId: teamLead.id,
    seniorAnalystId: seniorAnalyst.id,
    supportAgentName: supportAgent.name,
    supportOlgaName: supportOlga.name,
    supportDenisName: supportDenis.name,
    supportElenaName: supportElena.name
  });
  const predefinedReviewedConversationIds = new Set(
    [...currentPeriodReviewedConversations, ...previousPeriodReviewedConversations].map((seed) => seed.externalId)
  );
  const generatedExpansionReviewedConversations = generatedTwoMonthReviewedConversations.filter(
    (seed) => !predefinedReviewedConversationIds.has(seed.externalId)
  );

  const additionalReviewRecords: Awaited<ReturnType<typeof createReviewedConversation>>[] = [];

  for (const seed of [...currentPeriodReviewedConversations, ...previousPeriodReviewedConversations, ...generatedExpansionReviewedConversations]) {
    additionalReviewRecords.push(await createReviewedConversation(seed));
  }

  const additionalReviewByExternalId = new Map(additionalReviewRecords.map((record) => [record.conversation.externalId, record.review]));
  const additionalConversationByExternalId = new Map(additionalReviewRecords.map((record) => [record.conversation.externalId, record.conversation]));
  function reviewIdFor(externalId: string) {
    const review = additionalReviewByExternalId.get(externalId);

    if (!review) {
      throw new Error(`Missing seeded review for ${externalId}`);
    }

    return review.id;
  }
  function conversationIdFor(externalId: string) {
    const seededConversation = additionalConversationByExternalId.get(externalId);

    if (!seededConversation) {
      throw new Error(`Missing seeded conversation for ${externalId}`);
    }

    return seededConversation.id;
  }

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
      },
      {
        reviewId: reviewIdFor("INT-5101"),
        actorId: teamLead.id,
        action: "appeal_opened",
        comment: "Оператор оспорил трактовку компенсации, вынесено на разбор."
      },
      {
        reviewId: reviewIdFor("OTRS-2602"),
        actorId: seniorAnalyst.id,
        action: "calibration_requested",
        comment: "Критическая маршрутизация требует калибровки правила."
      },
      {
        reviewId: reviewIdFor("INT-5102"),
        actorId: analyst.id,
        action: "appeal_corrected",
        comment: "После апелляции уточнили формулировку и отметили переответ выполненным."
      },
      {
        reviewId: reviewIdFor("HS-4302"),
        actorId: seniorAnalyst.id,
        action: "acknowledged",
        comment: "Эталонный пример добавлен в рекомендации для команды."
      },
      {
        reviewId: reviewIdFor("ZD-6902"),
        actorId: analyst.id,
        action: "reanswer_requested",
        comment: "Переответ нужен из-за отсутствия следующего шага."
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
      },
      {
        workspaceId: workspace.id,
        assigneeName: supportAgent.name,
        supportLine: "2ЛП",
        periodStart: new Date("2026-05-22T00:00:00.000Z"),
        periodEnd: new Date("2026-06-21T23:59:59.999Z"),
        plannedCount: 18,
        dsatTargetPercent: 45,
        absenceDays: 0,
        note: "Текущий период: усиленный контроль маршрутизации и переответов."
      },
      {
        workspaceId: workspace.id,
        assigneeName: supportOlga.name,
        supportLine: "1ЛП",
        periodStart: new Date("2026-05-22T00:00:00.000Z"),
        periodEnd: new Date("2026-06-21T23:59:59.999Z"),
        plannedCount: 18,
        dsatTargetPercent: 35,
        absenceDays: 0,
        note: "Текущий период: стабильный поток ФГИС."
      },
      {
        workspaceId: workspace.id,
        assigneeName: supportDenis.name,
        supportLine: "1ЛП",
        periodStart: new Date("2026-05-22T00:00:00.000Z"),
        periodEnd: new Date("2026-06-21T23:59:59.999Z"),
        plannedCount: 16,
        dsatTargetPercent: 30,
        absenceDays: 1,
        note: "Текущий период: коммерческие сервисы и документы."
      },
      {
        workspaceId: workspace.id,
        assigneeName: supportElena.name,
        supportLine: "2ЛП",
        periodStart: new Date("2026-05-22T00:00:00.000Z"),
        periodEnd: new Date("2026-06-21T23:59:59.999Z"),
        plannedCount: 16,
        dsatTargetPercent: 35,
        absenceDays: 0,
        note: "Текущий период: личный кабинет, шаблоны и акции."
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
        configJson: JSON.stringify({ contract: "custom_conversation_v1" }),
        syncStateJson: JSON.stringify({
          source: "custom_api",
          cursor: "demo-cursor-2026-05-02T12:10:00Z",
          progress: { checkedCount: 4, importedCount: 4, skippedCount: 0, errorCount: 0 }
        }),
        schedule: "0 */4 * * *",
        syncCursor: "demo-cursor-2026-05-02T12:10:00Z",
        lastSyncedAt: new Date("2026-05-02T12:10:00.000Z"),
        lastImportAt: new Date("2026-05-02T12:10:00.000Z")
      },
      {
        workspaceId: workspace.id,
        source: "otrs_family",
        displayName: "Znuny / OTRS / OTOBO",
        type: "otrs_family",
        status: "ready",
        baseUrl: "https://support.example.com/znuny",
        configJson: JSON.stringify({ webService: "GenericTicketConnectorREST" }),
        syncStateJson: JSON.stringify({
          source: "otrs_family",
          cursor: "TicketID>2452",
          progress: { checkedCount: 18, importedCount: 18, skippedCount: 0, errorCount: 0 }
        }),
        schedule: "15 */2 * * *",
        syncCursor: "TicketID>2452",
        lastSyncedAt: new Date("2026-05-02T12:00:00.000Z"),
        lastDryRunAt: new Date("2026-05-02T12:00:00.000Z")
      },
      {
        workspaceId: workspace.id,
        source: "zendesk",
        displayName: "Zendesk",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://company.zendesk.com",
        configJson: JSON.stringify({ endpoint: "/api/v2/tickets" }),
        syncStateJson: JSON.stringify({
          source: "zendesk",
          cursor: "updated_at:2026-05-26T09:20:00Z",
          progress: { checkedCount: 6, importedCount: 3, skippedCount: 3, errorCount: 0 }
        }),
        schedule: "30 */6 * * *",
        syncCursor: "updated_at:2026-05-26T09:20:00Z",
        lastSyncedAt: new Date("2026-05-26T09:20:00.000Z"),
        lastImportAt: new Date("2026-05-26T09:20:00.000Z")
      },
      {
        workspaceId: workspace.id,
        source: "intercom",
        displayName: "Intercom",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://api.intercom.io",
        configJson: JSON.stringify({ endpoint: "/conversations" }),
        syncStateJson: JSON.stringify({
          source: "intercom",
          cursor: "conversation:INT-5102",
          progress: { checkedCount: 3, importedCount: 2, skippedCount: 1, errorCount: 0 }
        }),
        schedule: "45 */6 * * *",
        syncCursor: "conversation:INT-5102",
        lastSyncedAt: new Date("2026-05-24T16:10:00.000Z"),
        lastImportAt: new Date("2026-05-24T16:10:00.000Z")
      },
      {
        workspaceId: workspace.id,
        source: "freshdesk",
        displayName: "Freshdesk",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://company.freshdesk.com",
        configJson: JSON.stringify({ endpoint: "/api/v2/tickets" }),
        syncStateJson: JSON.stringify({
          source: "freshdesk",
          cursor: "updated_since=2026-05-25T08:20:00Z",
          progress: { checkedCount: 4, importedCount: 2, skippedCount: 2, errorCount: 0 }
        }),
        schedule: "10 */8 * * *",
        syncCursor: "updated_since=2026-05-25T08:20:00Z",
        lastSyncedAt: new Date("2026-05-25T08:20:00.000Z"),
        lastImportAt: new Date("2026-05-25T08:20:00.000Z")
      },
      {
        workspaceId: workspace.id,
        source: "hubspot",
        displayName: "HubSpot Service Hub",
        type: "native_helpdesk",
        status: "ready",
        baseUrl: "https://api.hubapi.com",
        configJson: JSON.stringify({ endpoint: "/crm/v3/objects/tickets" }),
        syncStateJson: JSON.stringify({
          source: "hubspot",
          cursor: "after=HS-4302",
          progress: { checkedCount: 4, importedCount: 2, skippedCount: 2, errorCount: 0 }
        }),
        schedule: "20 */8 * * *",
        syncCursor: "after=HS-4302",
        lastSyncedAt: new Date("2026-05-25T10:35:00.000Z"),
        lastImportAt: new Date("2026-05-25T10:35:00.000Z")
      }
    ]
  });

  const integrations = await prisma.integration.findMany({ where: { workspaceId: workspace.id } });
  const otrsIntegration = integrations.find((integration) => integration.source === "otrs_family");
  const customIntegration = integrations.find((integration) => integration.source === "custom_api");
  const zendeskIntegration = integrations.find((integration) => integration.source === "zendesk");
  const intercomIntegration = integrations.find((integration) => integration.source === "intercom");
  const freshdeskIntegration = integrations.find((integration) => integration.source === "freshdesk");
  const hubspotIntegration = integrations.find((integration) => integration.source === "hubspot");

  await prisma.integrationCredential.createMany({
    data: [
      ...(otrsIntegration
        ? [
            {
              workspaceId: workspace.id,
              integrationId: otrsIntegration.id,
              kind: "auth_password",
              authMode: "basic",
              encryptedSecret: `demo-redacted-sha256:${hashApiToken("demo-otrs-password-ref")}`,
              keyVersion: "demo-redacted-v1",
              fingerprint: `sha256:${hashApiToken("demo-otrs-password-ref").slice(0, 16)}`,
              lastRotatedAt: new Date("2026-05-02T11:50:00.000Z")
            }
          ]
        : []),
      ...(zendeskIntegration
        ? [
            {
              workspaceId: workspace.id,
              integrationId: zendeskIntegration.id,
              kind: "api_token",
              authMode: "bearer",
              encryptedSecret: `demo-redacted-sha256:${hashApiToken("demo-zendesk-token-ref")}`,
              keyVersion: "demo-redacted-v1",
              fingerprint: `sha256:${hashApiToken("demo-zendesk-token-ref").slice(0, 16)}`,
              lastRotatedAt: new Date("2026-05-20T09:00:00.000Z")
            }
          ]
        : []),
      ...(intercomIntegration
        ? [
            {
              workspaceId: workspace.id,
              integrationId: intercomIntegration.id,
              kind: "api_token",
              authMode: "bearer",
              encryptedSecret: `demo-redacted-sha256:${hashApiToken("demo-intercom-token-ref")}`,
              keyVersion: "demo-redacted-v1",
              fingerprint: `sha256:${hashApiToken("demo-intercom-token-ref").slice(0, 16)}`,
              lastRotatedAt: new Date("2026-05-20T09:10:00.000Z")
            }
          ]
        : []),
      ...(freshdeskIntegration
        ? [
            {
              workspaceId: workspace.id,
              integrationId: freshdeskIntegration.id,
              kind: "api_token",
              authMode: "basic",
              encryptedSecret: `demo-redacted-sha256:${hashApiToken("demo-freshdesk-token-ref")}`,
              keyVersion: "demo-redacted-v1",
              fingerprint: `sha256:${hashApiToken("demo-freshdesk-token-ref").slice(0, 16)}`,
              lastRotatedAt: new Date("2026-05-20T09:20:00.000Z")
            }
          ]
        : []),
      ...(hubspotIntegration
        ? [
            {
              workspaceId: workspace.id,
              integrationId: hubspotIntegration.id,
              kind: "api_token",
              authMode: "bearer",
              encryptedSecret: `demo-redacted-sha256:${hashApiToken("demo-hubspot-token-ref")}`,
              keyVersion: "demo-redacted-v1",
              fingerprint: `sha256:${hashApiToken("demo-hubspot-token-ref").slice(0, 16)}`,
              lastRotatedAt: new Date("2026-05-20T09:30:00.000Z")
            }
          ]
        : [])
    ]
  });

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
        startedAt: new Date("2026-05-02T11:55:00.000Z"),
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
        startedAt: new Date("2026-05-02T12:05:00.000Z"),
        finishedAt: new Date("2026-05-02T12:10:00.000Z")
      }
    ]
  });

  const otrsDryRun = await prisma.integrationRun.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "otrs_family",
      startedAt: new Date("2026-05-02T11:55:00.000Z")
    }
  });
  const customImportRun = await prisma.integrationRun.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "custom_api",
      startedAt: new Date("2026-05-02T12:05:00.000Z")
    }
  });

  await prisma.integrationRunItem.createMany({
    data: [
      ...(otrsDryRun
        ? [
            {
              workspaceId: workspace.id,
              integrationRunId: otrsDryRun.id,
              externalId: "OTRS-2451",
              ticketNumber: "2451",
              status: "imported",
              articleCount: 2,
              privateArticleCount: 0,
              attachmentCount: 1,
              warningsJson: "[]",
              errorsJson: "[]",
              conversationId: accurateConversation.id,
              normalizedPreviewJson: JSON.stringify({
                subject: accurateConversation.subject,
                channel: "TICKET",
                assigneeName: "Ольга Иванова"
              })
            },
            {
              workspaceId: workspace.id,
              integrationRunId: otrsDryRun.id,
              externalId: "OTRS-2452",
              ticketNumber: "2452",
              status: "imported",
              articleCount: 2,
              privateArticleCount: 1,
              attachmentCount: 0,
              warningsJson: JSON.stringify(["private_article_redacted"]),
              errorsJson: "[]",
              conversationId: criticalConversation.id,
              normalizedPreviewJson: JSON.stringify({
                subject: criticalConversation.subject,
                channel: "EMAIL",
                assigneeName: "Иван Петров"
              })
            },
            {
              workspaceId: workspace.id,
              integrationRunId: otrsDryRun.id,
              externalId: "OTRS-2602",
              ticketNumber: "2602",
              status: "skipped_existing",
              articleCount: 3,
              privateArticleCount: 0,
              attachmentCount: 0,
              warningsJson: JSON.stringify(["already_imported_in_demo_seed"]),
              errorsJson: "[]",
              conversationId: conversationIdFor("OTRS-2602"),
              normalizedPreviewJson: JSON.stringify({
                subject: "Неверный отдел для технической ошибки",
                channel: "EMAIL",
                assigneeName: "Иван Петров"
              })
            }
          ]
        : []),
      ...(customImportRun
        ? [
            {
              workspaceId: workspace.id,
              integrationRunId: customImportRun.id,
              externalId: "conv-2101",
              ticketNumber: "conv-2101",
              status: "imported",
              articleCount: 3,
              privateArticleCount: 0,
              attachmentCount: 0,
              warningsJson: "[]",
              errorsJson: "[]",
              conversationId: conversationIdFor("conv-2101"),
              normalizedPreviewJson: JSON.stringify({
                subject: "Повторное обращение по начислению бонусов",
                channel: "CHAT",
                assigneeName: "Денис Соколов"
              })
            },
            {
              workspaceId: workspace.id,
              integrationRunId: customImportRun.id,
              externalId: "conv-2102",
              ticketNumber: "conv-2102",
              status: "imported",
              articleCount: 2,
              privateArticleCount: 0,
              attachmentCount: 0,
              warningsJson: "[]",
              errorsJson: "[]",
              conversationId: conversationIdFor("conv-2102"),
              normalizedPreviewJson: JSON.stringify({
                subject: "Ручной аудит шаблонного ответа",
                channel: "CHAT",
                assigneeName: "Елена Морозова"
              })
            }
          ]
        : [])
    ]
  });

  const otrsDiagnosticRun = otrsIntegration
    ? await prisma.integrationDiagnosticRun.create({
        data: {
          workspaceId: workspace.id,
          integrationId: otrsIntegration.id,
          actorId: admin.id,
          status: "succeeded",
          mode: "manual_ticket_get",
          startedAt: new Date("2026-05-02T11:47:00.000Z"),
          finishedAt: new Date("2026-05-02T11:48:20.000Z"),
          summaryJson: JSON.stringify({
            product: "znuny",
            checkedTicketId: "2451",
            redacted: true
          }),
          redactedEndpoint: "https://support.example.com/znuny/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/TicketGet",
          steps: {
            create: [
              {
                key: "config",
                position: 1,
                status: "succeeded",
                durationMs: 12,
                detailJson: JSON.stringify({ profile: "znuny", secrets: "redacted" })
              },
              {
                key: "tls",
                position: 2,
                status: "succeeded",
                durationMs: 44,
                detailJson: JSON.stringify({ certificate: "demo-fingerprint-only" })
              },
              {
                key: "webservice",
                position: 3,
                status: "succeeded",
                durationMs: 88,
                detailJson: JSON.stringify({ route: "TicketGet" })
              },
              {
                key: "auth",
                position: 4,
                status: "succeeded",
                durationMs: 61,
                detailJson: JSON.stringify({ credentialFingerprint: `sha256:${hashApiToken("demo-otrs-password-ref").slice(0, 16)}` })
              },
              {
                key: "ticket_get",
                position: 5,
                status: "succeeded",
                durationMs: 305,
                detailJson: JSON.stringify({ ticketId: "2451", articleCount: 2 })
              },
              {
                key: "normalize",
                position: 6,
                status: "succeeded",
                durationMs: 27,
                detailJson: JSON.stringify({ conversationExternalId: "OTRS-2451" })
              },
              {
                key: "db_dry_run",
                position: 7,
                status: "succeeded",
                durationMs: 36,
                detailJson: JSON.stringify({ wouldCreate: false, wouldUpdate: true })
              }
            ]
          }
        }
      })
    : null;

  if (otrsDiagnosticRun) {
    await prisma.integrationRunItem.create({
      data: {
        workspaceId: workspace.id,
        diagnosticRunId: otrsDiagnosticRun.id,
        externalId: "OTRS-2451",
        ticketNumber: "2451",
        status: "diagnosed",
        articleCount: 2,
        privateArticleCount: 0,
        attachmentCount: 1,
        warningsJson: "[]",
        errorsJson: "[]",
        conversationId: accurateConversation.id,
        normalizedPreviewJson: JSON.stringify({
          subject: accurateConversation.subject,
          dryRun: true,
          redacted: true
        })
      }
    });
  }

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
          {
            userId: analyst.id,
            status: "completed",
            completedAt: new Date("2026-05-06T10:30:00.000Z"),
            notes: "Оценил оба обращения, просит закрепить правило по маршрутизации."
          },
          {
            userId: teamLead.id,
            status: "in_progress",
            notes: "Завершил критический кейс, второй оставлен для сравнения."
          }
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

  await createCalibrationReview({
    conversationId: criticalConversation.id,
    reviewerId: analyst.id,
    totalScore: 72,
    summary: "Калибровка: замечание критичное, но аналитик оставил часть баллов за корректный тон.",
    finalizedAt: new Date("2026-05-06T09:20:00.000Z"),
    notes: "Спор по весу критической маршрутизации."
  });

  await createCalibrationReview({
    conversationId: criticalConversation.id,
    reviewerId: teamLead.id,
    totalScore: 55,
    summary: "Калибровка: руководитель снижает оценку из-за потери SLA и отсутствия владельца.",
    finalizedAt: new Date("2026-05-06T10:05:00.000Z"),
    notes: "Расхождение больше 10 п.п.; нужно единое правило по критическим маршрутизациям."
  });

  await createCalibrationReview({
    conversationId: accurateConversation.id,
    reviewerId: analyst.id,
    totalScore: 94,
    summary: "Калибровка: эталонная проверка точности ответа и инструкции.",
    finalizedAt: new Date("2026-05-06T10:25:00.000Z"),
    notes: "Согласовать как позитивный пример для блока полноты решения."
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

  await prisma.trainingAssignment.createMany({
    data: [
      {
        workspaceId: workspace.id,
        reviewId: criticalReview.id,
        assigneeId: supportAgent.id,
        assignedById: teamLead.id,
        assigneeName: supportAgent.name,
        title: "Разбор критической маршрутизации",
        description: "Разобрать пример OTRS-2452, закрепить правило передачи обращения и подготовить корректный переответ.",
        dueAt: new Date("2026-05-07T12:00:00.000Z"),
        status: "open"
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("OTRS-2602"),
        assigneeId: supportAgent.id,
        assignedById: teamLead.id,
        assigneeName: supportAgent.name,
        title: "Переответ после неверной маршрутизации",
        description: "Подготовить новый ответ клиенту: владелец, причина передачи, срок и канал обновления.",
        dueAt: new Date("2026-05-24T12:00:00.000Z"),
        status: "in_progress"
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("HS-4301"),
        assigneeId: supportOlga.id,
        assignedById: analyst.id,
        assigneeName: supportOlga.name,
        title: "Документы: проверка фактического статуса",
        description: "Отработать сценарий, где клиенту нужен не общий срок, а подтверждение отправки документов.",
        dueAt: new Date("2026-05-24T12:00:00.000Z"),
        status: "open"
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("INT-5102"),
        assigneeId: supportAgent.id,
        assignedById: analyst.id,
        assigneeName: supportAgent.name,
        title: "Формулировка при задержке ответа",
        description: "Закрепить короткое признание задержки, причину и следующий шаг без лишней защиты.",
        dueAt: new Date("2026-05-28T12:00:00.000Z"),
        status: "done"
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("conv-2102"),
        assigneeId: supportElena.id,
        assignedById: seniorAnalyst.id,
        assigneeName: supportElena.name,
        title: "Персонализация шаблонов",
        description: "Переписать общий шаблон под тип заявления и добавить чек-лист документов.",
        dueAt: new Date("2026-05-27T12:00:00.000Z"),
        status: "in_progress"
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("ZD-7001"),
        assigneeId: supportDenis.id,
        assignedById: seniorAnalyst.id,
        assigneeName: supportDenis.name,
        title: "Ожидания по кодам авторизации",
        description: "Добавлять клиенту срок доставки кода и запасной канал, если код не приходит.",
        dueAt: new Date("2026-05-29T12:00:00.000Z"),
        status: "open"
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("FD-3101"),
        assigneeId: supportAgent.id,
        assignedById: teamLead.id,
        assigneeName: supportAgent.name,
        title: "Обходной путь при загрузке файла",
        description: "Закрепить сбор технических деталей и передачу на вторую линию с понятным сроком.",
        dueAt: new Date("2026-05-15T12:00:00.000Z"),
        status: "done"
      },
      {
        workspaceId: workspace.id,
        reviewId: null,
        assigneeId: supportOlga.id,
        assignedById: teamLead.id,
        assigneeName: supportOlga.name,
        title: "Ручной разбор новых правил по срокам",
        description: "Без привязки к проверке: обновить личный чек-лист по срокам рассмотрения и просрочкам.",
        dueAt: new Date("2026-05-30T12:00:00.000Z"),
        status: "open"
      }
    ]
  });

  await prisma.authSession.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: admin.id,
        providerId: demoProvider.id,
        sessionTokenHash: hashApiToken("demo-session-admin-active"),
        status: "ACTIVE",
        ipHash: hashApiToken("127.0.0.1-admin").slice(0, 24),
        userAgent: "Demo Browser / admin",
        expiresAt: new Date("2026-06-01T12:00:00.000Z"),
        createdAt: new Date("2026-05-26T08:00:00.000Z"),
        lastSeenAt: new Date("2026-05-26T11:45:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: analyst.id,
        providerId: demoProvider.id,
        sessionTokenHash: hashApiToken("demo-session-qa-active"),
        status: "ACTIVE",
        ipHash: hashApiToken("127.0.0.1-qa").slice(0, 24),
        userAgent: "Demo Browser / qa",
        expiresAt: new Date("2026-05-28T12:00:00.000Z"),
        createdAt: new Date("2026-05-25T08:30:00.000Z"),
        lastSeenAt: new Date("2026-05-26T10:10:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: seniorAnalyst.id,
        providerId: entraProvider.id,
        sessionTokenHash: hashApiToken("demo-session-entra-senior-revoked"),
        status: "REVOKED",
        ipHash: hashApiToken("10.0.0.12-senior").slice(0, 24),
        userAgent: "Microsoft Edge / Entra demo",
        expiresAt: new Date("2026-05-29T12:00:00.000Z"),
        revokedAt: new Date("2026-05-25T15:35:00.000Z"),
        createdAt: new Date("2026-05-24T08:30:00.000Z"),
        lastSeenAt: new Date("2026-05-25T15:30:00.000Z")
      },
      {
        workspaceId: workspace.id,
        userId: supportAgent.id,
        providerId: demoProvider.id,
        sessionTokenHash: hashApiToken("demo-session-agent-expired"),
        status: "EXPIRED",
        ipHash: hashApiToken("127.0.0.1-agent").slice(0, 24),
        userAgent: "Demo Browser / agent",
        expiresAt: new Date("2026-05-24T12:00:00.000Z"),
        createdAt: new Date("2026-05-23T08:00:00.000Z"),
        lastSeenAt: new Date("2026-05-24T11:50:00.000Z")
      }
    ]
  });

  const integrationImportJob = await prisma.backendJob.create({
    data: {
      workspaceId: workspace.id,
      type: "INTEGRATION_IMPORT",
      status: "SUCCEEDED",
      queueName: "integrations",
      priority: 40,
      payloadJson: JSON.stringify({
        integrationId: otrsIntegration?.id ?? null,
        runId: otrsDryRun?.id ?? null,
        source: "otrs_family"
      }),
      resultJson: JSON.stringify({ importedCount: 18, errorCount: 0, dryRun: true }),
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date("2026-05-02T11:54:00.000Z"),
      startedAt: new Date("2026-05-02T11:55:00.000Z"),
      finishedAt: new Date("2026-05-02T12:00:00.000Z"),
      createdById: admin.id,
      createdAt: new Date("2026-05-02T11:54:00.000Z"),
      events: {
        create: [
          {
            level: "info",
            message: "Dry-run OTRS завершен: импортировано 18 из 100.",
            metadata: JSON.stringify({ source: "otrs_family", importedCount: 18 })
          }
        ]
      }
    }
  });

  const directorySyncJob = await prisma.backendJob.create({
    data: {
      workspaceId: workspace.id,
      type: "DIRECTORY_SYNC",
      status: "FAILED",
      queueName: "directory",
      priority: 60,
      payloadJson: JSON.stringify({ providerId: entraProvider.id, mode: "groups_delta" }),
      resultJson: "{}",
      errorMessage: "Demo: SCIM delta endpoint недоступен, требуется live-доступ.",
      attempts: 3,
      maxAttempts: 3,
      runAfter: new Date("2026-05-18T09:00:00.000Z"),
      startedAt: new Date("2026-05-18T09:01:00.000Z"),
      finishedAt: new Date("2026-05-18T09:03:00.000Z"),
      createdById: admin.id,
      createdAt: new Date("2026-05-18T09:00:00.000Z"),
      events: {
        create: [
          {
            level: "error",
            message: "Синхронизация каталога остановлена на защищенном live-gate.",
            metadata: JSON.stringify({ provider: "microsoft-entra-id", redacted: true })
          }
        ]
      }
    }
  });

  const reportExportJob = await prisma.backendJob.create({
    data: {
      workspaceId: workspace.id,
      type: "REPORT_EXPORT",
      status: "SUCCEEDED",
      queueName: "reports",
      priority: 80,
      payloadJson: JSON.stringify({
        periodStart: "2026-05-22T00:00:00.000Z",
        periodEnd: "2026-06-21T23:59:59.999Z",
        format: "xlsx"
      }),
      resultJson: JSON.stringify({ filePath: "demo/reports/current-quality.xlsx", fileSize: 48240 }),
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date("2026-05-26T12:30:00.000Z"),
      startedAt: new Date("2026-05-26T12:31:00.000Z"),
      finishedAt: new Date("2026-05-26T12:31:08.000Z"),
      createdById: teamLead.id,
      createdAt: new Date("2026-05-26T12:30:00.000Z"),
      events: {
        create: [
          {
            level: "info",
            message: "Экспорт отчета сформирован для демо-периода.",
            metadata: JSON.stringify({ format: "xlsx", redacted: true })
          }
        ]
      }
    }
  });

  await prisma.backendJob.create({
    data: {
      workspaceId: workspace.id,
      type: "RETENTION_CLEANUP",
      status: "CANCELLED",
      queueName: "maintenance",
      priority: 120,
      payloadJson: JSON.stringify({ target: "expired_sessions", dryRun: true }),
      resultJson: JSON.stringify({ deletedCount: 0, dryRun: true }),
      attempts: 0,
      maxAttempts: 1,
      runAfter: new Date("2026-05-27T03:00:00.000Z"),
      createdById: admin.id,
      createdAt: new Date("2026-05-26T12:40:00.000Z"),
      events: {
        create: [
          {
            level: "info",
            message: "Плановая очистка отменена в демо-окружении.",
            metadata: JSON.stringify({ dryRun: true })
          }
        ]
      }
    }
  });

  const apiToken = isDemoAuthEnabled()
    ? await prisma.apiToken.create({
        data: {
          workspaceId: workspace.id,
          name: "Локальный dev API",
          tokenPrefix: `${demoApiToken.slice(0, 7)}...`,
          tokenHash: hashApiToken(demoApiToken),
          scopes: "all"
        }
      })
    : null;

  await prisma.auditLog.createMany({
    data: [
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        action: "seed.created",
        targetType: "workspace",
        targetId: workspace.id,
        metadata: JSON.stringify({
          analystId: analyst.id,
          teamLeadId: teamLead.id,
          supportAgentId: supportAgent.id,
          scorecardId: scorecard.id,
          conversationId: conversation.id,
          apiTokenId: apiToken?.id ?? null,
          calibrationSessionId: calibrationSession.id,
          additionalHumanReviews:
            currentPeriodReviewedConversations.length + previousPeriodReviewedConversations.length + generatedExpansionReviewedConversations.length
        }),
        createdAt: new Date("2026-05-26T12:45:00.000Z")
      },
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        action: "integrations.diagnostic_completed",
        targetType: "integration",
        targetId: otrsIntegration?.id ?? "otrs_family",
        metadata: JSON.stringify({
          diagnosticRunId: otrsDiagnosticRun?.id ?? null,
          source: "otrs_family",
          status: "succeeded"
        }),
        createdAt: new Date("2026-05-02T11:48:20.000Z")
      },
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        action: "backend_job.succeeded",
        targetType: "backend_job",
        targetId: integrationImportJob.id,
        metadata: JSON.stringify({
          type: "INTEGRATION_IMPORT",
          source: "otrs_family",
          importedCount: 18
        }),
        createdAt: new Date("2026-05-02T12:00:00.000Z")
      },
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        action: "backend_job.failed",
        targetType: "backend_job",
        targetId: directorySyncJob.id,
        metadata: JSON.stringify({
          type: "DIRECTORY_SYNC",
          providerId: entraProvider.id,
          redacted: true
        }),
        createdAt: new Date("2026-05-18T09:03:00.000Z")
      },
      {
        workspaceId: workspace.id,
        actorId: teamLead.id,
        action: "reports.export_created",
        targetType: "backend_job",
        targetId: reportExportJob.id,
        metadata: JSON.stringify({
          format: "xlsx",
          periodStart: "2026-05-22",
          periodEnd: "2026-06-21"
        }),
        createdAt: new Date("2026-05-26T12:31:08.000Z")
      },
      {
        workspaceId: workspace.id,
        actorId: teamLead.id,
        action: "training.assignment_created",
        targetType: "training_assignment",
        targetId: "demo-training-batch",
        metadata: JSON.stringify({
          count: 8,
          statuses: ["open", "in_progress", "done"]
        }),
        createdAt: new Date("2026-05-26T12:35:00.000Z")
      }
    ]
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
