import { createHash } from "node:crypto";
import { type ConversationChannel, type FindingOwnerType, type Prisma, type ReviewSource, type RiskLevel } from "@prisma/client";
import { demoApiToken } from "../src/lib/custom-api-docs";
import { translationKeySeeds } from "../src/lib/i18n/keys";
import { type PreparedDemoSeed } from "./demo-seed-bootstrap";
import {
  buildDemoOperationalTimeline,
  type OperationalConversationSeed,
  type OperationalReviewSeed
} from "./demo-operational-seeds";
import { daysFrom, type DemoClock } from "./demo-calendar";
import type { ReviewedConversationSeed } from "./demo-review-seeds";

function hashApiToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

type DemoApiTokenSeedDelegate = Pick<
  Prisma.TransactionClient["apiToken"],
  "create"
>;

export async function createSeededDemoApiToken(
  env: Record<string, string | undefined>,
  apiToken: DemoApiTokenSeedDelegate,
  workspaceId: string
) {
  if (env.QC_DEMO_AUTH !== "enabled") return null;

  return apiToken.create({
    data: {
      workspaceId,
      name: "Локальный dev API",
      tokenPrefix: `${demoApiToken.slice(0, 7)}...`,
      tokenHash: hashApiToken(demoApiToken),
      scopes: "all"
    }
  });
}

export type DemoSeedMutationHooks = {
  afterWorkspaceUpsert?: () => void | Promise<void>;
};

export async function mutateDemoSeed(
  preparedDemoSeed: PreparedDemoSeed,
  prisma: Prisma.TransactionClient,
  hooks: DemoSeedMutationHooks = {}
) {
  const calendar = preparedDemoSeed.calendar;
  const analyticalScenario = preparedDemoSeed.analyticalScenario;
  const workspaceId = preparedDemoSeed.ids.workspace;
  const at = (dayOffset: number, clock: DemoClock = {}) =>
    daysFrom(calendar, dayOffset, clock);
  const timeline = buildDemoOperationalTimeline(calendar);

  await prisma.translationAudit.deleteMany({ where: { workspaceId } });
  await prisma.translationValue.deleteMany({ where: { workspaceId } });
  await prisma.locale.deleteMany({ where: { workspaceId } });
  await prisma.auditLog.deleteMany({ where: { workspaceId } });
  await prisma.reportSnapshot.deleteMany({ where: { workspaceId } });
  await prisma.idempotencyKey.deleteMany({ where: { workspaceId } });
  await prisma.backendJobEvent.deleteMany({ where: { job: { workspaceId } } });
  await prisma.backendJob.deleteMany({ where: { workspaceId } });
  await prisma.messagingDelivery.deleteMany({ where: { workspaceId } });
  await prisma.messagingChannel.deleteMany({ where: { workspaceId } });
  await prisma.reviewEvent.deleteMany({ where: { workspaceId } });
  await prisma.apiRateLimit.deleteMany({ where: { workspaceId } });
  await prisma.authSession.deleteMany({ where: { workspaceId } });
  await prisma.userIdentityGroup.deleteMany({ where: { workspaceId } });
  await prisma.identityGroup.deleteMany({ where: { workspaceId } });
  await prisma.groupRoleMapping.deleteMany({ where: { workspaceId } });
  await prisma.externalIdentity.deleteMany({
    where: { user: { workspaceId } }
  });
  await prisma.integrationRunItem.deleteMany({ where: { workspaceId } });
  await prisma.integrationDiagnosticStep.deleteMany({
    where: { diagnosticRun: { workspaceId } }
  });
  await prisma.integrationDiagnosticRun.deleteMany({ where: { workspaceId } });
  await prisma.integrationRun.deleteMany({ where: { workspaceId } });
  await prisma.integrationCredential.deleteMany({ where: { workspaceId } });
  await prisma.savedQueueView.deleteMany({ where: { workspaceId } });
  await prisma.savedReportView.deleteMany({ where: { workspaceId } });
  await prisma.calibrationParticipant.deleteMany({
    where: { session: { workspaceId } }
  });
  await prisma.calibrationSessionItem.deleteMany({
    where: { session: { workspaceId } }
  });
  await prisma.calibrationSession.deleteMany({ where: { workspaceId } });
  await prisma.reviewFeedbackEvent.deleteMany({
    where: { review: { workspaceId } }
  });
  await prisma.trainingAssignment.deleteMany({ where: { workspaceId } });
  await prisma.samplingRule.deleteMany({ where: { workspaceId } });
  await prisma.qualityKnowledgeEntry.deleteMany({ where: { workspaceId } });
  await prisma.reviewQuota.deleteMany({ where: { workspaceId } });
  await prisma.coachingAction.deleteMany({
    where: { finding: { review: { workspaceId } } }
  });
  await prisma.aiQualityDraft.deleteMany({ where: { workspaceId } });
  await prisma.finding.deleteMany({ where: { review: { workspaceId } } });
  await prisma.criterionScore.deleteMany({
    where: { review: { workspaceId } }
  });
  await prisma.review.deleteMany({ where: { workspaceId } });
  await prisma.scorecardCriterion.deleteMany({
    where: { scorecard: { workspaceId } }
  });
  await prisma.scorecard.deleteMany({ where: { workspaceId } });
  await prisma.message.deleteMany({ where: { conversation: { workspaceId } } });
  await prisma.conversation.deleteMany({ where: { workspaceId } });
  await prisma.integration.deleteMany({ where: { workspaceId } });
  await prisma.apiToken.deleteMany({ where: { workspaceId } });
  await prisma.identityProvider.deleteMany({ where: { workspaceId } });
  await prisma.user.deleteMany({ where: { workspaceId } });

  const workspaceData = {
      id: preparedDemoSeed.ids.workspace,
      name: preparedDemoSeed.names.workspace,
      brandName: "QA Контроль",
      brandTagline: "Поддержка и проверки",
      brandMark: "QA",
      brandLogoAlt: "Логотип QA Контроль",
      brandPrimaryColor: "#3157d5",
      brandAccentColor: "#0f766e",
      createdAt: calendar.now,
      updatedAt: calendar.now
  };
  const workspace = await prisma.workspace.upsert({
    where: { id: workspaceId },
    create: workspaceData,
    update: workspaceData
  });
  await hooks.afterWorkspaceUpsert?.();

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

  const [ruLocale, enLocale] = await Promise.all([
    prisma.locale.create({
      data: {
        workspaceId: workspace.id,
        code: "ru",
        name: "Русский",
        isDefault: true,
        isEnabled: true
      }
    }),
    prisma.locale.create({
      data: {
        workspaceId: workspace.id,
        code: "en",
        name: "English",
        isDefault: false,
        isEnabled: true
      }
    })
  ]);

  const translationsPublishedAt = calendar.now;

  for (const seed of translationKeySeeds) {
    const key = await prisma.translationKey.upsert({
      where: {
        namespace_key: {
          namespace: seed.namespace,
          key: seed.key
        }
      },
      create: {
        namespace: seed.namespace,
        key: seed.key,
        defaultText: seed.defaultText,
        ownerArea: seed.ownerArea
      },
      update: {}
    });

    await prisma.translationValue.createMany({
      data: [
        {
          workspaceId: workspace.id,
          localeId: ruLocale.id,
          keyId: key.id,
          draftText: seed.defaultText,
          publishedText: seed.defaultText,
          publishedAt: translationsPublishedAt,
          publishedById: admin.id,
          version: 1
        },
        {
          workspaceId: workspace.id,
          localeId: enLocale.id,
          keyId: key.id,
          draftText: seed.en,
          publishedText: seed.en,
          publishedAt: translationsPublishedAt,
          publishedById: admin.id,
          version: 1
        }
      ]
    });
  }

  const analyst = await prisma.user.create({
    data: {
      id: preparedDemoSeed.ids.analyst,
      workspaceId: workspace.id,
      email: "qa@example.com",
      name: preparedDemoSeed.names.analyst,
      role: "QA_ANALYST",
      supportLine: "1ЛП",
      teamName: "Контроль качества"
    }
  });

  const teamLead = await prisma.user.create({
    data: {
      id: preparedDemoSeed.ids.teamLead,
      workspaceId: workspace.id,
      email: "lead@example.com",
      name: preparedDemoSeed.names.teamLead,
      role: "TEAM_LEAD",
      supportLine: "2ЛП",
      teamName: "Контроль качества"
    }
  });

  const supportAgent = await prisma.user.create({
    data: {
      id: "demo-operator-01",
      workspaceId: workspace.id,
      email: "ivan@example.com",
      name: preparedDemoSeed.names.supportAgent,
      role: "SUPPORT_AGENT",
      supportLine: "2ЛП",
      teamName: "Процессные эскалации",
      createdAt: calendar.now,
      updatedAt: calendar.now
    }
  });

  const seniorAnalyst = await prisma.user.create({
    data: {
      id: preparedDemoSeed.ids.seniorAnalyst,
      workspaceId: workspace.id,
      email: "maria.qa@example.com",
      name: preparedDemoSeed.names.seniorAnalyst,
      role: "QA_ANALYST",
      supportLine: "2ЛП",
      teamName: "Контроль качества"
    }
  });

  const supportOlga = await prisma.user.create({
    data: {
      id: "demo-operator-02",
      workspaceId: workspace.id,
      email: "olga.agent@example.com",
      name: preparedDemoSeed.names.supportOlga,
      role: "SUPPORT_AGENT",
      supportLine: "1ЛП",
      teamName: "Процессные эскалации",
      createdAt: calendar.now,
      updatedAt: calendar.now
    }
  });

  const supportDenis = await prisma.user.create({
    data: {
      id: "demo-operator-03",
      workspaceId: workspace.id,
      email: "denis.agent@example.com",
      name: preparedDemoSeed.names.supportDenis,
      role: "SUPPORT_AGENT",
      supportLine: "1ЛП",
      teamName: "Процессные эскалации",
      createdAt: calendar.now,
      updatedAt: calendar.now
    }
  });

  const supportElena = await prisma.user.create({
    data: {
      id: "demo-operator-04",
      workspaceId: workspace.id,
      email: "elena.agent@example.com",
      name: preparedDemoSeed.names.supportElena,
      role: "SUPPORT_AGENT",
      supportLine: "2ЛП",
      teamName: "Процессные эскалации",
      createdAt: calendar.now,
      updatedAt: calendar.now
    }
  });

  await prisma.user.createMany({
    data: [
      ["demo-operator-05", "Александр Ким", "fgis-services", "1ЛП"],
      ["demo-operator-06", "Надежда Орлова", "fgis-services", "1ЛП"],
      ["demo-operator-07", "Михаил Громов", "fgis-services", "2ЛП"],
      ["demo-operator-08", "Софья Беляева", "fgis-services", "2ЛП"],
      ["demo-operator-09", "Роман Тихонов", "account-commerce", "1ЛП"],
      ["demo-operator-10", "Алина Бородина", "account-commerce", "1ЛП"],
      [
        "demo-operator-11",
        "Екатерина Александровна Вышеславцева",
        "account-commerce",
        "2ЛП"
      ],
      ["demo-operator-12", "Тимофей Нестеров", "account-commerce", "2ЛП"]
    ].map(([id, name, teamSlug, supportLine], index) => ({
      id,
      workspaceId: workspace.id,
      email: `demo.operator.${String(index + 5).padStart(2, "0")}@example.com`,
      name,
      role: "SUPPORT_AGENT" as const,
      supportLine,
      teamName:
        teamSlug === "fgis-services"
          ? "ФГИС и государственные сервисы"
          : "Личный кабинет и коммерческие услуги",
      createdAt: calendar.now,
      updatedAt: calendar.now
    }))
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
        id: "demo-quota-operator-01-current",
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
        lastSyncAt: timeline.recentActivity[0]
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_TeamLeads",
        externalGroupName: "QC_TeamLeads",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 1 }),
        lastSyncAt: timeline.recentActivity[0]
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        externalGroupName: "QC_Analysts",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 2 }),
        lastSyncAt: timeline.recentActivity[0]
      },
      {
        workspaceId: workspace.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        externalGroupName: "Support_Agents",
        rawAttributesJson: JSON.stringify({ source: "demo-seed", memberCount: 4 }),
        lastSyncAt: timeline.recentActivity[0]
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
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: teamLead.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_TeamLeads",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: analyst.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: seniorAnalyst.id,
        providerId: entraProvider.id,
        externalGroupId: "QC_Analysts",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: supportAgent.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: supportOlga.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: supportDenis.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      },
      {
        workspaceId: workspace.id,
        userId: supportElena.id,
        providerId: entraProvider.id,
        externalGroupId: "Support_Agents",
        lastSyncAt: at(-5, { hour: 10, minute: 19 })
      }
    ]
  });

  const scorecard = await prisma.scorecard.create({
    data: {
      id: "demo-scorecard-v1",
      workspaceId: workspace.id,
      name: "Цифровая поддержка",
      version: 1,
      createdAt: calendar.now,
      updatedAt: calendar.now,
      criteria: {
        create: analyticalScenario.criteria.map(
          (criterion) => ({
            id: criterion.id,
            key: criterion.key,
            label: criterion.label,
            block: criterion.block,
            kind: "SCALE_1_3" as const,
            weight: criterion.weight,
            order: criterion.order
          })
        )
      }
    }
  });

  const activeCriteria = await prisma.scorecardCriterion.findMany({
    where: { scorecardId: scorecard.id },
    orderBy: { order: "asc" }
  });
  const operationalStatusPlan = preparedDemoSeed.statusPlan;

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
      reviewDueAt: at(-22, { hour: 12 }),
      samplingReason: "Высокий риск: политика возврата",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "Возвраты",
      riskHint: "Возможное нарушение политики",
      openedAt: at(-32, { hour: 10 }),
      closedAt: at(-32, { hour: 10, minute: 18 }),
      messages: {
        create: [
          {
            externalId: "msg-1",
            participantType: "CUSTOMER",
            authorName: "Мила Петрова",
            body: "Доставка задерживается, я хочу возврат.",
            sentAt: at(-32, { hour: 10 })
          },
          {
            externalId: "msg-2",
            participantType: "HUMAN_AGENT",
            authorName: "Иван Петров",
            body: "Помогу разобраться. Заказ еще в пути, поэтому сегодня можем предложить бонусный кредит или оформить возврат после подтверждения перевозчика.",
            sentAt: at(-32, { hour: 10, minute: 4 })
          },
          {
            externalId: "msg-3",
            participantType: "CUSTOMER",
            authorName: "Мила Петрова",
            body: "Бонусный кредит подойдет, если заказ приедет на этой неделе.",
            sentAt: at(-32, { hour: 10, minute: 9 })
          },
          {
            externalId: "msg-4",
            participantType: "HUMAN_AGENT",
            authorName: "Иван Петров",
            body: "Я начислил бонусный кредит и создал задачу на проверку у перевозчика. Обновление придет до пятницы.",
            sentAt: at(-32, { hour: 10, minute: 18 })
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
      reviewDueAt: at(-28, { hour: 12 }),
      samplingReason: "Плановая случайная выборка",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      riskHint: null,
      openedAt: at(-33, { hour: 8 }),
      closedAt: at(-33, { hour: 8, minute: 45 }),
      messages: {
        create: [
          {
            externalId: "otrs-2451-1",
            participantType: "CUSTOMER",
            authorName: "Анна Смирнова",
            body: "Подскажите, где посмотреть статус заявления?",
            sentAt: at(-33, { hour: 8 })
          },
          {
            externalId: "otrs-2451-2",
            participantType: "HUMAN_AGENT",
            authorName: "Ольга Иванова",
            body: "Статус можно проверить в разделе «Заявления». Я приложила ссылку на инструкцию и указала следующий шаг.",
            sentAt: at(-33, { hour: 8, minute: 12 })
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
      reviewDueAt: at(-26, { hour: 12 }),
      samplingReason: "Негативный CSAT и сигнал руководителя",
      samplingType: "LEAD_SIGNAL",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Возможна потеря времени из-за маршрутизации",
      openedAt: at(-29, { hour: 9 }),
      closedAt: at(-29, { hour: 18, minute: 20 }),
      messages: {
        create: [
          {
            externalId: "otrs-2452-1",
            participantType: "CUSTOMER",
            authorName: "Сергей Волков",
            body: "Обращение зависло, сроки ответа уже прошли.",
            sentAt: at(-29, { hour: 9 })
          },
          {
            externalId: "otrs-2452-2",
            participantType: "HUMAN_AGENT",
            authorName: "Иван Петров",
            body: "Ваш вопрос передан в другой отдел.",
            sentAt: at(-29, { hour: 18, minute: 20 })
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
      reviewDueAt: at(-45, { hour: 12 }),
      samplingReason: "Плановая случайная выборка прошлого периода",
      samplingType: "RANDOM",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: at(-47, { hour: 10 }),
      closedAt: at(-47, { hour: 10, minute: 30 }),
      messages: {
        create: [
          {
            externalId: "msg-prev-1",
            participantType: "CUSTOMER",
            authorName: "Дмитрий Орлов",
            body: "Не приходят уведомления.",
            sentAt: at(-47, { hour: 10 })
          },
          {
            externalId: "msg-prev-2",
            participantType: "HUMAN_AGENT",
            authorName: "Ольга Иванова",
            body: "Проверьте настройки уведомлений в профиле, я приложила инструкцию.",
            sentAt: at(-47, { hour: 10, minute: 12 })
          }
        ]
      }
    }
  });

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
    id?: string;
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
    criterionValues?: ReviewedConversationSeed["criterionValues"];
    findingId?: string;
    coachingActionId?: string | null;
    coachingDueAt?: Date | null;
    feedbackAckAt?: Date | null;
    createdAt?: Date;
  }) {
    const review = await prisma.review.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        workspaceId: workspace.id,
        conversationId: input.conversationId,
        reviewerId: input.reviewerId ?? analyst.id,
        scorecardId: scorecard.id,
        reviewSource: input.reviewSource ?? "HUMAN",
        rubricVersion: scorecard.version,
        status: "FINALIZED",
        totalScore: input.totalScore,
        summary: input.summary,
        feedbackComment: input.summary,
        positiveNotes: input.positiveNotes ?? "Ответ структурирован, тон корректный.",
        instructionLinks: "Регламент КК, чек-лист оценки качества",
        feedbackStatus: input.feedbackStatus ?? "feedback_sent",
        feedbackAckAt: input.feedbackAckAt ?? null,
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
        createdAt:
          input.createdAt ??
          new Date(input.finalizedAt.getTime() - 120 * 60 * 1000),
        updatedAt: input.finalizedAt,
        scores: {
          create: activeCriteria.map((criterion, index) => ({
            ...(input.criterionValues?.[index]?.id
              ? { id: input.criterionValues[index].id }
              : {}),
            criterionId: criterion.id,
            value:
              input.criterionValues?.[index]?.value ??
              input.scoreValueOverrides?.[index] ??
              (input.totalScore >= 90 ? 3 : input.totalScore >= 75 ? 2 : 1),
            passed: null,
            isNotApplicable: false,
            comment: "",
            evidenceMessageId:
              input.criterionValues?.[index]?.evidenceMessageId ?? null
          }))
        },
        findings: {
          create: {
            ...(input.findingId ? { id: input.findingId } : {}),
            ownerType: input.ownerType ?? "AGENT",
            category: input.category,
            rootCause: input.criticalError ? "Критическая ошибка процесса обработки." : "Точечное замечание по критерию.",
            riskLevel: input.riskLevel,
            evidenceSummary: input.summary,
            createdAt: input.finalizedAt,
            coachingAction:
              input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL"
                ? {
                    create: {
                      ...(input.coachingActionId
                        ? { id: input.coachingActionId }
                        : {}),
                      assignee: input.ownerType === "PROCESS" ? "Руководитель контроля качества" : "Проверяющий",
                      action: input.criticalError
                        ? "Провести разбор 1:1 в течение 3 рабочих дней."
                        : "Разобрать пример с оператором и закрепить корректную формулировку.",
                      dueAt:
                        input.coachingDueAt ??
                        new Date(input.finalizedAt.getTime() + 3 * 24 * 60 * 60 * 1000),
                      createdAt: input.finalizedAt,
                      updatedAt: input.finalizedAt
                    }
                  }
                : undefined
          }
        }
      }
    });

    return review;
  }

  async function createDraftReview(input: OperationalReviewSeed & { conversationId: string }) {
    return prisma.review.create({
      data: {
        workspaceId: workspace.id,
        conversationId: input.conversationId,
        reviewerId: input.reviewerId,
        scorecardId: scorecard.id,
        reviewSource: input.reviewSource ?? "HUMAN",
        rubricVersion: scorecard.version,
        status: "DRAFT",
        totalScore: input.totalScore,
        summary: input.summary,
        feedbackComment: "",
        positiveNotes: input.positiveNotes ?? "",
        instructionLinks: "Черновик проверки, регламент КК",
        feedbackStatus: input.feedbackStatus ?? "new",
        appealStatus: input.appealStatus ?? "none",
        criticalError: input.criticalError ?? false,
        criticalCategory: input.criticalCategory,
        needsReanswer: input.needsReanswer ?? false,
        reanswerStatus: input.reanswerStatus ?? "not_needed",
        calibrationStatus: "none",
        calibrationNotes: "",
        scores: {
          create: activeCriteria.map((criterion, index) => ({
            criterionId: criterion.id,
            value: scoreValuesFor(input.totalScore)[index],
            passed: null,
            isNotApplicable: false,
            comment: index === 0 ? "Черновая оценка для демонстрации незавершенного разбора." : "",
            evidenceMessageId: null
          }))
        },
        findings: {
          create: {
            ownerType: input.ownerType ?? "AGENT",
            category: input.category,
            rootCause: "Черновик: причина уточняется проверяющим.",
            riskLevel: input.riskLevel,
            evidenceSummary: input.summary,
            coachingAction:
              input.riskLevel === "HIGH" || input.riskLevel === "CRITICAL"
                ? {
                    create: {
                      assignee: "Проверяющий",
                      action: "Довести черновик до финального решения и согласовать действие с руководителем.",
                      dueAt: at(2, { hour: 12 })
                    }
                  }
                : undefined
          }
        }
      }
    });
  }

  async function createOperationalConversation(input: OperationalConversationSeed) {
    const createdConversation = await prisma.conversation.create({
      data: {
        workspaceId: workspace.id,
        externalSource: input.externalSource,
        externalId: input.externalId,
        externalUrl: input.externalUrl ?? `https://example.com/tickets/${encodeURIComponent(input.externalId)}`,
        channel: input.channel,
        subject: input.subject,
        status: input.status,
        tags: input.tags,
        customerName: input.customerName,
        assigneeName: input.assigneeName ?? null,
        qaStatus: input.qaStatus,
        qaAssigneeId: input.qaAssigneeId ?? null,
        qaAssigneeName: input.qaAssigneeName ?? null,
        reviewDueAt: input.reviewDueAt,
        samplingReason: input.samplingReason,
        samplingType: input.samplingType,
        csatScore: input.csatScore,
        csatBucket: input.csatBucket,
        supportLine: input.supportLine,
        teamName: input.teamName,
        riskHint: input.riskHint ?? null,
        openedAt: input.openedAt,
        closedAt: input.closedAt ?? null,
        messages: {
          create: input.messages.map((item, index) => ({
            externalId: `${input.externalId}-operational-msg-${index + 1}`,
            participantType: item.participantType,
            authorName: item.authorName,
            body: item.body,
            sentAt: item.sentAt,
            isPrivate: item.isPrivate ?? false
          }))
        }
      }
    });

    const draftReview = input.draftReview
      ? await createDraftReview({
          ...input.draftReview,
          conversationId: createdConversation.id
        })
      : null;
    const previousFinalizedReview = input.previousFinalizedReview
      ? await createFinalizedReview({
          ...input.previousFinalizedReview,
          conversationId: createdConversation.id,
          reviewSource: "SELF_REVIEW",
          finalizedAt: input.previousFinalizedReview.finalizedAt ?? new Date(input.openedAt.getTime() + 2 * 60 * 60 * 1000)
        })
      : null;

    if (previousFinalizedReview && input.qaStatus === "REOPENED") {
      await prisma.reviewEvent.create({
        data: {
          workspaceId: workspace.id,
          reviewId: previousFinalizedReview.id,
          conversationId: createdConversation.id,
          actorId: input.qaAssigneeId ?? teamLead.id,
          action: "qa.reopened",
          fromStatus: "FINALIZED",
          toStatus: "REOPENED",
          metadata: JSON.stringify({ reason: input.samplingReason, demo: true }),
          createdAt: new Date(previousFinalizedReview.finalizedAt?.getTime() ?? input.reviewDueAt.getTime())
        }
      });
    }

    return { conversation: createdConversation, draftReview, previousFinalizedReview };
  }

  async function createReviewedConversation(input: ReviewedConversationSeed) {
    const reviewerName = reviewerNameById.get(input.reviewerId) ?? analyst.name;
    const messages = [
      {
        id: input.customerMessageId,
        externalId: `${input.externalId}-customer`,
        participantType: "CUSTOMER" as const,
        authorName: input.customerName,
        body: input.customerMessage,
        sentAt: input.openedAt,
        createdAt: input.openedAt
      },
      ...(input.customerFollowUp
        ? [
            {
              externalId: `${input.externalId}-msg-2`,
              participantType: "CUSTOMER" as const,
              authorName: input.customerName,
              body: input.customerFollowUp,
              sentAt: new Date(input.openedAt.getTime() + 8 * 60 * 1000),
              createdAt: new Date(input.openedAt.getTime() + 8 * 60 * 1000)
            }
          ]
        : []),
      {
        id: input.agentMessageId,
        externalId: `${input.externalId}-agent`,
        participantType: "HUMAN_AGENT" as const,
        authorName: input.assigneeName,
        body: input.agentMessage,
        sentAt: input.closedAt,
        createdAt: input.closedAt
      }
    ];

    const createdConversation = await prisma.conversation.create({
      data: {
        id: input.conversationId,
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
        assigneeId: input.operatorId,
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
        sentiment: null,
        sentimentScore: null,
        sentimentModel: null,
        openedAt: input.openedAt,
        closedAt: input.closedAt,
        createdAt: input.openedAt,
        updatedAt: input.finalizedAt,
        messages: {
          create: messages
        }
      }
    });

    const review = await createFinalizedReview({
      id: input.reviewId,
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
      feedbackAckAt: input.feedbackAckAt,
      appealStatus: input.appealStatus,
      positiveNotes: input.positiveNotes,
      criterionValues: input.criterionValues,
      findingId: input.findingId,
      coachingActionId: input.coachingActionId,
      coachingDueAt: input.coachingDueAt,
      createdAt: input.openedAt
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
        createdAt: new Date(input.finalizedAt.getTime() - 5 * 60 * 1000),
        updatedAt: input.finalizedAt,
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
    reviewSource: "CALIBRATION",
    totalScore: 94,
    summary: "Оператор дал точный ответ, приложил инструкцию и обозначил следующий шаг.",
    category: "Полнота решения",
    riskLevel: "LOW",
    finalizedAt: at(-31, { hour: 10 })
  });

  const criticalReview = await createFinalizedReview({
    conversationId: criticalConversation.id,
    reviewSource: "CALIBRATION",
    totalScore: 62,
    summary: "Обращение было передано без достаточного пояснения и вышло за ожидаемый срок реакции.",
    category: "Неверная маршрутизация",
    riskLevel: "CRITICAL",
    ownerType: "PROCESS",
    finalizedAt: at(-27, { hour: 11 }),
    criticalError: true,
    criticalCategory: "Неверная маршрутизация с потерей времени",
    needsReanswer: true,
    reanswerStatus: "required",
    appealStatus: "open",
    positiveNotes: "Оператор сохранил корректный тон, но процесс обработки требует разбора."
  });

  const previousReview = await createFinalizedReview({
    conversationId: previousConversation.id,
    reviewSource: "CALIBRATION",
    totalScore: 88,
    summary: "Прошлый период: ответ корректный, но не хватило персонализации.",
    category: "Персонализация",
    riskLevel: "MEDIUM",
    finalizedAt: at(-45, { hour: 9 })
  });

  const additionalReviewRecords: Awaited<ReturnType<typeof createReviewedConversation>>[] = [];

  for (const seed of analyticalScenario.reviews) {
    additionalReviewRecords.push(await createReviewedConversation(seed));
  }

  const additionalReviewByExternalId = new Map(additionalReviewRecords.map((record) => [record.conversation.externalId, record.review]));
  const additionalConversationByExternalId = new Map(additionalReviewRecords.map((record) => [record.conversation.externalId, record.conversation]));
  const operationalConversationRecords: Awaited<ReturnType<typeof createOperationalConversation>>[] = [];

  for (const seed of preparedDemoSeed.operationalSeeds) {
    operationalConversationRecords.push(await createOperationalConversation(seed));
  }

  const operationalConversationByExternalId = new Map(
    operationalConversationRecords.map((record) => [record.conversation.externalId, record.conversation])
  );
  const aiDraftConversation = operationalConversationByExternalId.get("OTRS-INPROGRESS-2701");

  if (aiDraftConversation) {
    await prisma.aiQualityDraft.createMany({
      data: [
        {
          workspaceId: workspace.id,
          conversationId: aiDraftConversation.id,
          kind: "risk_tag",
          status: "draft",
          modelVersion: "quality-router-stable",
          promptVersion: "risk-v3",
          suggestedValueJson: JSON.stringify({
            riskLevel: "HIGH",
            category: "Неверная маршрутизация",
            reason: "Клиент не получил владельца и срок следующего обновления."
          }),
          evidenceRefsJson: JSON.stringify(["message:customer:1", "message:agent:2"])
        },
        {
          workspaceId: workspace.id,
          conversationId: aiDraftConversation.id,
          kind: "coaching_suggestion",
          status: "changed",
          modelVersion: "quality-router-stable",
          promptVersion: "coaching-v2",
          suggestedValueJson: JSON.stringify({
            action: "Разобрать передачу без владельца и добавить обязательный срок next update.",
            owner: supportAgent.name
          }),
          evidenceRefsJson: JSON.stringify(["message:agent:2"]),
          finalizedById: analyst.id,
          finalizedAt: at(-2, { hour: 9, minute: 10 }),
          decisionReason: "Уточнили формулировку для coaching assignment."
        }
      ]
    });
  }

  await prisma.aiQualityDraft.createMany({
    data: analyticalScenario.aiDrafts.map((draft) => ({
      id: draft.id,
      workspaceId: workspace.id,
      conversationId: draft.conversationId,
      reviewId: draft.reviewId,
      kind: "score",
      status: "draft",
      modelVersion: draft.modelVersion,
      promptVersion: draft.promptVersion,
      confidence: draft.confidence,
      suggestedValueJson: JSON.stringify({
        criteria: draft.criteria,
        overallConfidence: draft.confidence,
        summary: "Демо-прогноз с проверяемыми ссылками на доказательства."
      }),
      evidenceRefsJson: JSON.stringify([draft.evidenceMessageId]),
      createdAt: draft.createdAt,
      updatedAt: draft.createdAt
    }))
  });

  await prisma.savedReportView.createMany({
    data: analyticalScenario.savedViews.map((view) => ({
      id: view.id,
      workspaceId: workspace.id,
      userId: null,
      name: view.name,
      href: view.href,
      scope: view.scope,
      order: view.order,
      createdAt: calendar.now,
      updatedAt: calendar.now
    }))
  });

  const legacyAnalyticalAliases = new Map([
    ["INT-5101", "demo-ticket-c03"],
    ["INT-5102", "demo-ticket-c14"],
    ["HS-4302", "demo-ticket-c09"],
    ["ZD-6902", "demo-ticket-p14"],
    ["conv-2101", "demo-ticket-c01"],
    ["conv-2102", "demo-ticket-c20"],
    ["ZD-7002", "demo-ticket-c10"],
    ["FD-3202", "demo-ticket-c02"],
    ["HS-4301", "demo-ticket-c05"],
    ["ZD-7001", "demo-ticket-c11"],
    ["FD-3101", "demo-ticket-p03"]
  ]);

  function reviewIdFor(externalId: string) {
    const review = additionalReviewByExternalId.get(
      legacyAnalyticalAliases.get(externalId) ?? externalId
    );

    if (!review) {
      throw new Error(`Missing seeded review for ${externalId}`);
    }

    return review.id;
  }
  function conversationIdFor(externalId: string) {
    const resolvedExternalId = legacyAnalyticalAliases.get(externalId) ?? externalId;
    const seededConversation = additionalConversationByExternalId.get(resolvedExternalId) ?? operationalConversationByExternalId.get(resolvedExternalId);

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
        comment: "Итог проверки отправлен оператору.",
        createdAt: at(-31, { hour: 10, minute: 17 })
      },
      {
        reviewId: criticalReview.id,
        actorId: teamLead.id,
        action: "appeal_opened",
        comment: "Нужен разбор критической маршрутизации.",
        createdAt: at(-27, { hour: 11, minute: 23 })
      },
      {
        reviewId: previousReview.id,
        actorId: analyst.id,
        action: "feedback_sent",
        comment: "Проверка прошлого периода закрыта.",
        createdAt: at(-45, { hour: 9, minute: 19 })
      },
      {
        reviewId: reviewIdFor("INT-5101"),
        actorId: teamLead.id,
        action: "appeal_opened",
        comment: "Оператор оспорил трактовку компенсации, вынесено на разбор.",
        createdAt: at(-5, { hour: 15, minute: 2 })
      },
      {
        reviewId: reviewIdFor("OTRS-2602"),
        actorId: seniorAnalyst.id,
        action: "calibration_requested",
        comment: "Критическая маршрутизация требует калибровки правила.",
        createdAt: at(-3, { hour: 10, minute: 7 })
      },
      {
        reviewId: reviewIdFor("INT-5102"),
        actorId: analyst.id,
        action: "appeal_corrected",
        comment: "После апелляции уточнили формулировку и отметили переответ выполненным.",
        createdAt: at(-3, { hour: 16, minute: 19 })
      },
      {
        reviewId: reviewIdFor("HS-4302"),
        actorId: seniorAnalyst.id,
        action: "acknowledged",
        comment: "Эталонный пример добавлен в рекомендации для команды.",
        createdAt: at(-2, { hour: 11, minute: 3 })
      },
      {
        reviewId: reviewIdFor("ZD-6902"),
        actorId: analyst.id,
        action: "reanswer_requested",
        comment: "Переответ нужен из-за отсутствия следующего шага.",
        createdAt: at(-7, { hour: 12, minute: 21 })
      }
    ]
  });

  await prisma.reviewQuota.createMany({
    data: [
      {
        workspaceId: workspace.id,
        assigneeName: "Иван Петров",
        supportLine: "2ЛП",
        periodStart: timeline.quotas.previous.start,
        periodEnd: timeline.quotas.previous.end,
        plannedCount: 19,
        dsatTargetPercent: 41,
        absenceDays: 0,
        note: "Повышенная доля DSAT из-за негативной динамики."
      },
      {
        workspaceId: workspace.id,
        assigneeName: "Ольга Иванова",
        supportLine: "1ЛП",
        periodStart: timeline.quotas.previous.start,
        periodEnd: timeline.quotas.previous.end,
        plannedCount: 21,
        dsatTargetPercent: 29,
        absenceDays: 0,
        note: "Плановая месячная норма."
      },
      {
        id: "demo-quota-operator-01-current",
        workspaceId: workspace.id,
        assigneeName: supportAgent.name,
        supportLine: "2ЛП",
        periodStart: timeline.quotas.current.start,
        periodEnd: timeline.quotas.current.end,
        plannedCount: 10,
        dsatTargetPercent: 43,
        absenceDays: 0,
        note: "Текущий период: усиленный контроль маршрутизации и переответов.",
        createdAt: calendar.now,
        updatedAt: calendar.now
      },
      {
        id: "demo-quota-operator-02-current",
        workspaceId: workspace.id,
        assigneeName: supportOlga.name,
        supportLine: "1ЛП",
        periodStart: timeline.quotas.current.start,
        periodEnd: timeline.quotas.current.end,
        plannedCount: 14,
        dsatTargetPercent: 34,
        absenceDays: 0,
        note: "Текущий период: стабильный поток ФГИС.",
        createdAt: calendar.now,
        updatedAt: calendar.now
      },
      {
        workspaceId: workspace.id,
        assigneeName: supportDenis.name,
        supportLine: "1ЛП",
        periodStart: timeline.quotas.current.start,
        periodEnd: timeline.quotas.current.end,
        plannedCount: 16,
        dsatTargetPercent: 31,
        absenceDays: 1,
        note: "Текущий период: коммерческие сервисы и документы."
      },
      {
        workspaceId: workspace.id,
        assigneeName: supportElena.name,
        supportLine: "2ЛП",
        periodStart: timeline.quotas.current.start,
        periodEnd: timeline.quotas.current.end,
        plannedCount: 15,
        dsatTargetPercent: 36,
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
          cursor: `demo-cursor-${timeline.integrationRuns.imported.finishedAt.toISOString()}`,
          progress: { checkedCount: 47, importedCount: 43, skippedCount: 4, errorCount: 0 }
        }),
        schedule: "0 */4 * * *",
        syncCursor: `demo-cursor-${timeline.integrationRuns.imported.finishedAt.toISOString()}`,
        lastSyncedAt: timeline.integrationRuns.imported.finishedAt,
        lastImportAt: timeline.integrationRuns.imported.finishedAt
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
          progress: { checkedCount: 37, importedCount: 34, skippedCount: 3, errorCount: 0 }
        }),
        schedule: "15 */2 * * *",
        syncCursor: "TicketID>2452",
        lastSyncedAt: timeline.integrationRuns.dryRun.finishedAt,
        lastDryRunAt: timeline.integrationRuns.dryRun.finishedAt
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
          cursor: `updated_at:${at(-1, { hour: 9, minute: 23 }).toISOString()}`,
          progress: { checkedCount: 29, importedCount: 17, skippedCount: 12, errorCount: 0 }
        }),
        schedule: "30 */6 * * *",
        syncCursor: `updated_at:${at(-1, { hour: 9, minute: 23 }).toISOString()}`,
        lastSyncedAt: at(-1, { hour: 9, minute: 23 }),
        lastImportAt: at(-1, { hour: 9, minute: 23 })
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
          progress: { checkedCount: 23, importedCount: 19, skippedCount: 4, errorCount: 0 }
        }),
        schedule: "45 */6 * * *",
        syncCursor: "conversation:INT-5102",
        lastSyncedAt: timeline.recentActivity[1],
        lastImportAt: timeline.recentActivity[1]
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
          cursor: `updated_since=${timeline.recentActivity[2].toISOString()}`,
          progress: { checkedCount: 31, importedCount: 22, skippedCount: 9, errorCount: 0 }
        }),
        schedule: "10 */8 * * *",
        syncCursor: `updated_since=${timeline.recentActivity[2].toISOString()}`,
        lastSyncedAt: timeline.recentActivity[2],
        lastImportAt: timeline.recentActivity[2]
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
          progress: { checkedCount: 26, importedCount: 21, skippedCount: 5, errorCount: 0 }
        }),
        schedule: "20 */8 * * *",
        syncCursor: "after=HS-4302",
        lastSyncedAt: at(-2, { hour: 10, minute: 41 }),
        lastImportAt: at(-2, { hour: 10, minute: 41 })
      },
      {
        workspaceId: workspace.id,
        source: "generic_webhook",
        displayName: "Generic Webhook",
        type: "webhook",
        status: "queued",
        baseUrl: "https://hooks.example.com/support-events",
        configJson: JSON.stringify({ acceptedEvents: ["conversation.upsert", "conversation.closed"], signing: "hmac_sha256" }),
        syncStateJson: JSON.stringify({
          source: "generic_webhook",
          cursor: null,
          progress: { checkedCount: 0, importedCount: 0, skippedCount: 0, errorCount: 0 }
        }),
        schedule: null,
        syncCursor: null
      },
      {
        workspaceId: workspace.id,
        source: "salesforce",
        displayName: "Salesforce Service Cloud",
        type: "native_helpdesk",
        status: "paused",
        baseUrl: "https://company.my.salesforce.com",
        configJson: JSON.stringify({ endpoint: "/services/data/v61.0/sobjects/Case" }),
        syncStateJson: JSON.stringify({
          source: "salesforce",
          cursor: `SystemModstamp>${at(-6, { hour: 10, minute: 4 }).toISOString()}`,
          progress: { checkedCount: 41, importedCount: 33, skippedCount: 8, errorCount: 0 }
        }),
        schedule: "0 */12 * * *",
        syncCursor: `SystemModstamp>${at(-6, { hour: 10, minute: 4 }).toISOString()}`,
        lastSyncedAt: at(-6, { hour: 10, minute: 4 }),
        lastImportAt: at(-6, { hour: 10, minute: 4 })
      },
      {
        workspaceId: workspace.id,
        source: "jira_service",
        displayName: "Jira Service Management",
        type: "native_helpdesk",
        status: "error",
        baseUrl: "https://company.atlassian.net",
        configJson: JSON.stringify({ endpoint: "/rest/servicedeskapi/request" }),
        syncStateJson: JSON.stringify({
          source: "jira_service",
          cursor: "request=JSM-184",
          progress: { checkedCount: 5, importedCount: 2, skippedCount: 1, errorCount: 2 }
        }),
        schedule: "15 */8 * * *",
        syncCursor: "request=JSM-184",
        lastSyncedAt: timeline.integrationRuns.retryScheduled.finishedAt,
        lastDryRunAt: timeline.integrationRuns.retryScheduled.finishedAt,
        lastError: "Demo: токен истек, нужен повторный live dry-run."
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
  const genericWebhookIntegration = integrations.find((integration) => integration.source === "generic_webhook");
  const salesforceIntegration = integrations.find((integration) => integration.source === "salesforce");
  const jiraServiceIntegration = integrations.find((integration) => integration.source === "jira_service");

  const slackChannel = await prisma.messagingChannel.create({
    data: {
      workspaceId: workspace.id,
      kind: "slack",
      displayName: "Slack #qa-ops",
      status: "active",
      capabilities: "action_notification",
      configJson: JSON.stringify({ target: "#qa-ops", demo: true }),
      lastDeliveredAt: timeline.messaging.channels.slack.lastDeliveredAt,
      createdAt: timeline.messaging.channels.slack.createdAt,
      updatedAt: timeline.messaging.channels.slack.updatedAt
    }
  });
  const teamsChannel = await prisma.messagingChannel.create({
    data: {
      workspaceId: workspace.id,
      kind: "teams",
      displayName: "Teams: QA Control",
      status: "draft",
      capabilities: "action_notification",
      configJson: JSON.stringify({ target: "QA Control", demo: true }),
      lastError: "Demo: webhook URL не подтвержден.",
      createdAt: timeline.messaging.channels.teams.createdAt,
      updatedAt: timeline.messaging.channels.teams.updatedAt
    }
  });

  await prisma.messagingDelivery.createMany({
    data: [
      {
        workspaceId: workspace.id,
        channelId: slackChannel.id,
        kind: "slack",
        eventType: "risk_spike",
        recipientType: "manager",
        recipientRef: teamLead.id,
        status: "delivered",
        title: "Рост риска",
        body: "3 сигнала высокого риска требуют разбора в очереди проверок.",
        href: "/reviews?status=reviewed&riskLevel=HIGH_OR_CRITICAL",
        payloadJson: JSON.stringify({ demo: true, riskCount: 3 }),
        createdAt: timeline.messaging.deliveries.delivered.createdAt,
        deliveredAt: timeline.messaging.deliveries.delivered.deliveredAt
      },
      {
        workspaceId: workspace.id,
        channelId: slackChannel.id,
        kind: "slack",
        eventType: "source_certification_lost",
        recipientType: "admin",
        recipientRef: admin.id,
        status: "queued",
        title: "Источник потерял live certification",
        body: "OTRS Family требует проверки evidence перед следующим импортом.",
        href: otrsIntegration ? `/admin/integrations/${otrsIntegration.id}` : "/admin/integrations",
        payloadJson: JSON.stringify({ demo: true, source: "otrs_family" }),
        createdAt: timeline.messaging.deliveries.queued.createdAt
      },
      {
        workspaceId: workspace.id,
        channelId: teamsChannel.id,
        kind: "teams",
        eventType: "training_overdue",
        recipientType: "manager",
        recipientRef: teamLead.id,
        status: "failed",
        title: "Просрочено обучение",
        body: "Иван Петров: просрочено 2 назначения обучения.",
        href: "/coaching",
        error: "Demo: Teams webhook URL не подтвержден.",
        payloadJson: JSON.stringify({ demo: true, assigneeName: supportAgent.name }),
        createdAt: timeline.messaging.deliveries.failed.createdAt
      }
    ]
  });

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
              lastRotatedAt: at(-25, { hour: 11, minute: 50 })
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
              lastRotatedAt: at(-7, { hour: 9 })
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
              lastRotatedAt: at(-7, { hour: 9, minute: 10 })
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
              lastRotatedAt: at(-7, { hour: 9, minute: 20 })
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
              lastRotatedAt: at(-7, { hour: 9, minute: 30 })
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
        startedAt: timeline.integrationRuns.dryRun.startedAt,
        finishedAt: timeline.integrationRuns.dryRun.finishedAt
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
        startedAt: timeline.integrationRuns.imported.startedAt,
        finishedAt: timeline.integrationRuns.imported.finishedAt
      },
      {
        workspaceId: workspace.id,
        integrationId: genericWebhookIntegration?.id,
        actorId: admin.id,
        source: "generic_webhook",
        mode: "webhook_ingest",
        status: "queued",
        dryRun: false,
        requestedLimit: 100,
        checkedCount: 0,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        startedAt: timeline.integrationRuns.queued.startedAt
      },
      {
        workspaceId: workspace.id,
        integrationId: salesforceIntegration?.id,
        actorId: seniorAnalyst.id,
        source: "salesforce",
        mode: "native_helpdesk",
        status: "dry_run_queued",
        dryRun: true,
        requestedLimit: 25,
        checkedCount: 0,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 0,
        startedAt: timeline.integrationRuns.dryRunQueued.startedAt
      },
      {
        workspaceId: workspace.id,
        integrationId: jiraServiceIntegration?.id,
        actorId: admin.id,
        source: "jira_service",
        mode: "native_helpdesk",
        status: "retry_scheduled",
        dryRun: true,
        requestedLimit: 50,
        checkedCount: 5,
        importedCount: 2,
        skippedCount: 1,
        errorCount: 2,
        errorMessage: "Demo: повтор запланирован после обновления токена.",
        startedAt: timeline.integrationRuns.retryScheduled.startedAt,
        finishedAt: timeline.integrationRuns.retryScheduled.finishedAt
      },
      {
        workspaceId: workspace.id,
        integrationId: jiraServiceIntegration?.id,
        actorId: admin.id,
        source: "jira_service",
        mode: "native_helpdesk",
        status: "failed",
        dryRun: false,
        requestedLimit: 20,
        checkedCount: 3,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 3,
        errorMessage: "Demo: API вернул 401 Unauthorized.",
        startedAt: timeline.integrationRuns.failed.startedAt,
        finishedAt: timeline.integrationRuns.failed.finishedAt
      }
    ]
  });

  const otrsDryRun = await prisma.integrationRun.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "otrs_family",
      startedAt: timeline.integrationRuns.dryRun.startedAt
    }
  });
  const customImportRun = await prisma.integrationRun.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "custom_api",
      startedAt: timeline.integrationRuns.imported.startedAt
    }
  });
  const webhookQueuedRun = await prisma.integrationRun.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "generic_webhook",
      startedAt: timeline.integrationRuns.queued.startedAt
    }
  });
  const jiraFailedRun = await prisma.integrationRun.findFirst({
    where: {
      workspaceId: workspace.id,
      source: "jira_service",
      startedAt: timeline.integrationRuns.failed.startedAt
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
        : []),
      ...(webhookQueuedRun
        ? [
            {
              workspaceId: workspace.id,
              integrationRunId: webhookQueuedRun.id,
              externalId: "WEBHOOK-9001",
              ticketNumber: "WEBHOOK-9001",
              status: "queued",
              articleCount: 0,
              privateArticleCount: 0,
              attachmentCount: 0,
              warningsJson: JSON.stringify(["waiting_for_signature_verification"]),
              errorsJson: "[]",
              conversationId: null,
              normalizedPreviewJson: JSON.stringify({
                eventType: "conversation.upsert",
                source: "generic_webhook",
                queued: true
              })
            }
          ]
        : []),
      ...(jiraFailedRun
        ? [
            {
              workspaceId: workspace.id,
              integrationRunId: jiraFailedRun.id,
              externalId: "JSM-184",
              ticketNumber: "JSM-184",
              status: "failed",
              articleCount: 1,
              privateArticleCount: 0,
              attachmentCount: 0,
              warningsJson: "[]",
              errorsJson: JSON.stringify(["401 Unauthorized", "token_expired"]),
              conversationId: null,
              normalizedPreviewJson: JSON.stringify({
                subject: "Ошибка импорта Jira Service Management",
                source: "jira_service",
                redacted: true
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
          startedAt: at(-25, { hour: 11, minute: 47 }),
          finishedAt: at(-25, { hour: 11, minute: 48, second: 20 }),
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
        order: 1,
        createdAt: at(-6, { hour: 9, minute: 14 })
      },
      {
        workspaceId: workspace.id,
        userId: null,
        name: "Критические за период",
        href: "/reviews?process=critical",
        scope: "workspace",
        order: 2,
        createdAt: at(-5, { hour: 11, minute: 26 })
      },
      {
        workspaceId: workspace.id,
        userId: null,
        name: "Негативный CSAT",
        href: "/reviews?csatBucket=NEGATIVE",
        scope: "workspace",
        order: 3,
        createdAt: at(-4, { hour: 15, minute: 8 })
      },
      {
        workspaceId: workspace.id,
        userId: null,
        name: "В работе",
        href: "/reviews?qaStatus=IN_PROGRESS",
        scope: "workspace",
        order: 4,
        createdAt: at(-3, { hour: 10, minute: 32 })
      },
      {
        workspaceId: workspace.id,
        userId: null,
        name: "Переоткрытые",
        href: "/reviews?qaStatus=REOPENED",
        scope: "workspace",
        order: 5,
        createdAt: at(-2, { hour: 16, minute: 5 })
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
      dueAt: timeline.calibrations.active.dueAt,
      notes: "Сравнить оценку критической маршрутизации и полноты комментариев.",
      createdAt: timeline.calibrations.active.createdAt,
      updatedAt: timeline.calibrations.active.updatedAt,
      participants: {
        create: [
          {
            userId: analyst.id,
            status: "completed",
            completedAt: timeline.calibrations.active.participants[0].completedAt,
            notes: "Оценил оба обращения, просит закрепить правило по маршрутизации.",
            createdAt: timeline.calibrations.active.participants[0].createdAt,
            updatedAt: timeline.calibrations.active.participants[0].updatedAt
          },
          {
            userId: teamLead.id,
            status: "in_progress",
            notes: "Завершил критический кейс, второй оставлен для сравнения.",
            createdAt: timeline.calibrations.active.participants[1].createdAt,
            updatedAt: timeline.calibrations.active.participants[1].updatedAt
          }
        ]
      },
      items: {
        create: [
          {
            conversationId: criticalConversation.id,
            baselineReviewId: criticalReview.id,
            createdAt: timeline.calibrations.active.itemCreatedAt[0]
          },
          {
            conversationId: accurateConversation.id,
            baselineReviewId: accurateReview.id,
            createdAt: timeline.calibrations.active.itemCreatedAt[1]
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
    finalizedAt: timeline.calibrations.active.reviewFinalizedAt[0],
    notes: "Спор по весу критической маршрутизации."
  });

  await createCalibrationReview({
    conversationId: criticalConversation.id,
    reviewerId: teamLead.id,
    totalScore: 55,
    summary: "Калибровка: руководитель снижает оценку из-за потери SLA и отсутствия владельца.",
    finalizedAt: timeline.calibrations.active.reviewFinalizedAt[1],
    notes: "Расхождение больше 10 п.п.; нужно единое правило по критическим маршрутизациям."
  });

  await createCalibrationReview({
    conversationId: accurateConversation.id,
    reviewerId: analyst.id,
    totalScore: 94,
    summary: "Калибровка: эталонная проверка точности ответа и инструкции.",
    finalizedAt: timeline.calibrations.active.reviewFinalizedAt[2],
    notes: "Согласовать как позитивный пример для блока полноты решения."
  });

  await prisma.calibrationSession.create({
    data: {
      workspaceId: workspace.id,
      ownerId: seniorAnalyst.id,
      scorecardId: scorecard.id,
      name: "Черновик калибровки по шаблонам",
      status: "draft",
      dueAt: timeline.calibrations.draft.dueAt,
      notes: "Новая сессия еще собирается: нужны кейсы по шаблонам и персонализации.",
      createdAt: timeline.calibrations.draft.createdAt,
      updatedAt: timeline.calibrations.draft.updatedAt,
      participants: {
        create: [
          {
            userId: analyst.id,
            status: "assigned",
            notes: "Ожидает старта сессии.",
            createdAt: timeline.calibrations.draft.participants[0].createdAt,
            updatedAt: timeline.calibrations.draft.participants[0].updatedAt
          },
          {
            userId: seniorAnalyst.id,
            status: "assigned",
            notes: "Подберет эталонный пример.",
            createdAt: timeline.calibrations.draft.participants[1].createdAt,
            updatedAt: timeline.calibrations.draft.participants[1].updatedAt
          }
        ]
      },
      items: {
        create: [
          {
            conversationId: conversationIdFor("ZD-7002"),
            baselineReviewId: reviewIdFor("ZD-7002"),
            createdAt: timeline.calibrations.draft.itemCreatedAt[0]
          },
          {
            conversationId: conversationIdFor("FD-3202"),
            baselineReviewId: reviewIdFor("FD-3202"),
            createdAt: timeline.calibrations.draft.itemCreatedAt[1]
          }
        ]
      }
    }
  });

  await prisma.calibrationSession.create({
    data: {
      workspaceId: workspace.id,
      ownerId: teamLead.id,
      scorecardId: scorecard.id,
      name: "Завершенная калибровка по документам",
      status: "completed",
      dueAt: timeline.calibrations.completed.dueAt,
      notes: "Сессия закрыта: правило по фактическому статусу документов закреплено.",
      createdAt: timeline.calibrations.completed.createdAt,
      updatedAt: timeline.calibrations.completed.updatedAt,
      participants: {
        create: [
          {
            userId: analyst.id,
            status: "completed",
            completedAt: timeline.calibrations.completed.participants[0].completedAt,
            notes: "Согласовал снижение за отсутствие фактического статуса.",
            createdAt: timeline.calibrations.completed.participants[0].createdAt,
            updatedAt: timeline.calibrations.completed.participants[0].updatedAt
          },
          {
            userId: seniorAnalyst.id,
            status: "completed",
            completedAt: timeline.calibrations.completed.participants[1].completedAt,
            notes: "Подтвердил правило по срокам документов.",
            createdAt: timeline.calibrations.completed.participants[1].createdAt,
            updatedAt: timeline.calibrations.completed.participants[1].updatedAt
          }
        ]
      },
      items: {
        create: [
          {
            conversationId: conversationIdFor("HS-4301"),
            baselineReviewId: reviewIdFor("HS-4301"),
            createdAt: timeline.calibrations.completed.itemCreatedAt[0]
          },
          {
            conversationId: conversationIdFor("ZD-7001"),
            baselineReviewId: reviewIdFor("ZD-7001"),
            createdAt: timeline.calibrations.completed.itemCreatedAt[1]
          }
        ]
      }
    }
  });

  await createCalibrationReview({
    conversationId: conversationIdFor("HS-4301"),
    reviewerId: analyst.id,
    totalScore: 66,
    summary: "Калибровка: отсутствие проверки статуса документов снижает оценку сильнее обычного замечания.",
    finalizedAt: timeline.calibrations.completed.reviewFinalizedAt[0],
    notes: "Правило закреплено для финансовых документов."
  });

  await createCalibrationReview({
    conversationId: conversationIdFor("HS-4301"),
    reviewerId: seniorAnalyst.id,
    totalScore: 69,
    summary: "Калибровка: согласована высокая важность фактической проверки статуса документов.",
    finalizedAt: timeline.calibrations.completed.reviewFinalizedAt[1],
    notes: "Расхождение внутри допустимого диапазона."
  });

  await prisma.calibrationSession.create({
    data: {
      workspaceId: workspace.id,
      ownerId: teamLead.id,
      scorecardId: scorecard.id,
      name: "Архив: тон и персонализация",
      status: "archived",
      dueAt: timeline.calibrations.archived.dueAt,
      notes: "Архивная сессия оставлена для демонстрации истории калибровок.",
      createdAt: timeline.calibrations.archived.createdAt,
      updatedAt: timeline.calibrations.archived.updatedAt,
      participants: {
        create: [
          {
            userId: analyst.id,
            status: "completed",
            completedAt: timeline.calibrations.archived.participants[0].completedAt,
            notes: "Историческая оценка закрыта.",
            createdAt: timeline.calibrations.archived.participants[0].createdAt,
            updatedAt: timeline.calibrations.archived.participants[0].updatedAt
          }
        ]
      },
      items: {
        create: [
          {
            conversationId: previousConversation.id,
            baselineReviewId: previousReview.id,
            createdAt: timeline.calibrations.archived.itemCreatedAt[0]
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
      },
      {
        workspaceId: workspace.id,
        name: "Пауза: старые макросы",
        type: "manual",
        conditionsJson: JSON.stringify({ tag: "legacy_macro", reason: "replaced_by_new_policy" }),
        targetPercent: 1,
        priority: 200,
        isActive: false
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
        dueAt: timeline.training.open[0].dueAt,
        status: "open",
        createdAt: timeline.training.open[0].createdAt,
        updatedAt: timeline.training.open[0].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("OTRS-2602"),
        assigneeId: supportAgent.id,
        assignedById: teamLead.id,
        assigneeName: supportAgent.name,
        title: "Переответ после неверной маршрутизации",
        description: "Подготовить новый ответ клиенту: владелец, причина передачи, срок и канал обновления.",
        dueAt: timeline.training.inProgress[0].dueAt,
        status: "in_progress",
        createdAt: timeline.training.inProgress[0].createdAt,
        updatedAt: timeline.training.inProgress[0].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("HS-4301"),
        assigneeId: supportOlga.id,
        assignedById: analyst.id,
        assigneeName: supportOlga.name,
        title: "Документы: проверка фактического статуса",
        description: "Отработать сценарий, где клиенту нужен не общий срок, а подтверждение отправки документов.",
        dueAt: timeline.training.open[1].dueAt,
        status: "open",
        createdAt: timeline.training.open[1].createdAt,
        updatedAt: timeline.training.open[1].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("INT-5102"),
        assigneeId: supportAgent.id,
        assignedById: analyst.id,
        assigneeName: supportAgent.name,
        title: "Формулировка при задержке ответа",
        description: "Закрепить короткое признание задержки, причину и следующий шаг без лишней защиты.",
        dueAt: timeline.training.done[0].dueAt,
        status: "done",
        createdAt: timeline.training.done[0].createdAt,
        updatedAt: timeline.training.done[0].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("conv-2102"),
        assigneeId: supportElena.id,
        assignedById: seniorAnalyst.id,
        assigneeName: supportElena.name,
        title: "Персонализация шаблонов",
        description: "Переписать общий шаблон под тип заявления и добавить чек-лист документов.",
        dueAt: timeline.training.inProgress[1].dueAt,
        status: "in_progress",
        createdAt: timeline.training.inProgress[1].createdAt,
        updatedAt: timeline.training.inProgress[1].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("ZD-7001"),
        assigneeId: supportDenis.id,
        assignedById: seniorAnalyst.id,
        assigneeName: supportDenis.name,
        title: "Ожидания по кодам авторизации",
        description: "Добавлять клиенту срок доставки кода и запасной канал, если код не приходит.",
        dueAt: timeline.training.open[2].dueAt,
        status: "open",
        createdAt: timeline.training.open[2].createdAt,
        updatedAt: timeline.training.open[2].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("FD-3101"),
        assigneeId: supportAgent.id,
        assignedById: teamLead.id,
        assigneeName: supportAgent.name,
        title: "Обходной путь при загрузке файла",
        description: "Закрепить сбор технических деталей и передачу на вторую линию с понятным сроком.",
        dueAt: timeline.training.done[1].dueAt,
        status: "done",
        createdAt: timeline.training.done[1].createdAt,
        updatedAt: timeline.training.done[1].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: null,
        assigneeId: supportOlga.id,
        assignedById: teamLead.id,
        assigneeName: supportOlga.name,
        title: "Ручной разбор новых правил по срокам",
        description: "Без привязки к проверке: обновить личный чек-лист по срокам рассмотрения и просрочкам.",
        dueAt: timeline.training.open[3].dueAt,
        status: "open",
        createdAt: timeline.training.open[3].createdAt,
        updatedAt: timeline.training.open[3].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: null,
        assigneeId: supportDenis.id,
        assignedById: analyst.id,
        assigneeName: supportDenis.name,
        title: "Очередь без финальной проверки",
        description: "Пройти короткий тренинг по тому, как работать с обращениями в статусах В очереди и В работе.",
        dueAt: timeline.training.open[4].dueAt,
        status: "open",
        createdAt: timeline.training.open[4].createdAt,
        updatedAt: timeline.training.open[4].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: null,
        assigneeId: supportElena.id,
        assignedById: seniorAnalyst.id,
        assigneeName: supportElena.name,
        title: "Правило компенсаций после апелляции",
        description: "Обновить личные заметки по акциям и показать два спорных примера руководителю.",
        dueAt: timeline.training.inProgress[2].dueAt,
        status: "in_progress",
        createdAt: timeline.training.inProgress[2].createdAt,
        updatedAt: timeline.training.inProgress[2].updatedAt
      },
      {
        workspaceId: workspace.id,
        reviewId: reviewIdFor("HS-4302"),
        assigneeId: supportDenis.id,
        assignedById: teamLead.id,
        assigneeName: supportDenis.name,
        title: "Эталонный сложный кейс",
        description: "Разобрать сильный пример структурного ответа и добавить прием в личный чек-лист.",
        dueAt: timeline.training.done[2].dueAt,
        status: "done",
        createdAt: timeline.training.done[2].createdAt,
        updatedAt: timeline.training.done[2].updatedAt
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
        expiresAt: timeline.authSessions.adminActive.expiresAt,
        createdAt: timeline.authSessions.adminActive.createdAt,
        lastSeenAt: timeline.authSessions.adminActive.lastSeenAt
      },
      {
        workspaceId: workspace.id,
        userId: analyst.id,
        providerId: demoProvider.id,
        sessionTokenHash: hashApiToken("demo-session-qa-active"),
        status: "ACTIVE",
        ipHash: hashApiToken("127.0.0.1-qa").slice(0, 24),
        userAgent: "Demo Browser / qa",
        expiresAt: timeline.authSessions.analystActive.expiresAt,
        createdAt: timeline.authSessions.analystActive.createdAt,
        lastSeenAt: timeline.authSessions.analystActive.lastSeenAt
      },
      {
        workspaceId: workspace.id,
        userId: seniorAnalyst.id,
        providerId: entraProvider.id,
        sessionTokenHash: hashApiToken("demo-session-entra-senior-revoked"),
        status: "REVOKED",
        ipHash: hashApiToken("10.0.0.12-senior").slice(0, 24),
        userAgent: "Microsoft Edge / Entra demo",
        expiresAt: timeline.authSessions.seniorRevoked.expiresAt,
        revokedAt: timeline.authSessions.seniorRevoked.revokedAt,
        createdAt: timeline.authSessions.seniorRevoked.createdAt,
        lastSeenAt: timeline.authSessions.seniorRevoked.lastSeenAt
      },
      {
        workspaceId: workspace.id,
        userId: supportAgent.id,
        providerId: demoProvider.id,
        sessionTokenHash: hashApiToken("demo-session-agent-expired"),
        status: "EXPIRED",
        ipHash: hashApiToken("127.0.0.1-agent").slice(0, 24),
        userAgent: "Demo Browser / agent",
        expiresAt: timeline.authSessions.agentExpired.expiresAt,
        createdAt: timeline.authSessions.agentExpired.createdAt,
        lastSeenAt: timeline.authSessions.agentExpired.lastSeenAt
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
      resultJson: JSON.stringify({ importedCount: 34, errorCount: 0, dryRun: true }),
      attempts: 1,
      maxAttempts: 3,
      runAfter: timeline.backendJobs.succeeded.runAfter,
      startedAt: timeline.backendJobs.succeeded.startedAt,
      finishedAt: timeline.backendJobs.succeeded.finishedAt,
      createdById: admin.id,
      createdAt: timeline.backendJobs.succeeded.createdAt,
      updatedAt: timeline.backendJobs.succeeded.updatedAt,
      events: {
        create: [
          {
            level: "info",
            message: "Dry-run OTRS завершен: проверено 37 обращений, 34 готовы к импорту.",
            metadata: JSON.stringify({ source: "otrs_family", importedCount: 34 }),
            createdAt: timeline.backendJobs.succeeded.eventCreatedAt
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
      runAfter: timeline.backendJobs.failed.runAfter,
      startedAt: timeline.backendJobs.failed.startedAt,
      finishedAt: timeline.backendJobs.failed.finishedAt,
      createdById: admin.id,
      createdAt: timeline.backendJobs.failed.createdAt,
      updatedAt: timeline.backendJobs.failed.updatedAt,
      events: {
        create: [
          {
            level: "error",
            message: "Синхронизация каталога остановлена на защищенном live-gate.",
            metadata: JSON.stringify({ provider: "microsoft-entra-id", redacted: true }),
            createdAt: timeline.backendJobs.failed.eventCreatedAt
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
        periodStart: timeline.quotas.current.start.toISOString(),
        periodEnd: timeline.quotas.current.end.toISOString(),
        format: "xlsx"
      }),
      resultJson: JSON.stringify({ filePath: "demo/reports/current-quality.xlsx", fileSize: 48763 }),
      attempts: 1,
      maxAttempts: 3,
      runAfter: timeline.backendJobs.report.runAfter,
      startedAt: timeline.backendJobs.report.startedAt,
      finishedAt: timeline.backendJobs.report.finishedAt,
      createdById: teamLead.id,
      createdAt: timeline.backendJobs.report.createdAt,
      updatedAt: timeline.backendJobs.report.updatedAt,
      events: {
        create: [
          {
            level: "info",
            message: "Экспорт отчета сформирован для демо-периода.",
            metadata: JSON.stringify({ format: "xlsx", redacted: true }),
            createdAt: timeline.backendJobs.report.eventCreatedAt
          }
        ]
      }
    }
  });

  const webhookQueuedJob = await prisma.backendJob.create({
    data: {
      workspaceId: workspace.id,
      type: "WEBHOOK_INGEST",
      status: "QUEUED",
      queueName: "integrations",
      priority: 35,
      payloadJson: JSON.stringify({
        integrationId: genericWebhookIntegration?.id ?? null,
        runId: webhookQueuedRun?.id ?? null,
        source: "generic_webhook"
      }),
      resultJson: "{}",
      attempts: 0,
      maxAttempts: 3,
      runAfter: timeline.backendJobs.queued.runAfter,
      createdById: admin.id,
      createdAt: timeline.backendJobs.queued.createdAt,
      updatedAt: timeline.backendJobs.queued.updatedAt,
      events: {
        create: [
          {
            level: "info",
            message: "Webhook-событие ожидает обработки воркером.",
            metadata: JSON.stringify({ source: "generic_webhook", status: "QUEUED" }),
            createdAt: timeline.backendJobs.queued.eventCreatedAt
          }
        ]
      }
    }
  });

  const runningImportJob = await prisma.backendJob.create({
    data: {
      workspaceId: workspace.id,
      type: "INTEGRATION_IMPORT",
      status: "RUNNING",
      queueName: "integrations",
      priority: 30,
      payloadJson: JSON.stringify({
        integrationId: salesforceIntegration?.id ?? null,
        source: "salesforce",
        mode: "dry_run"
      }),
      resultJson: "{}",
      attempts: 1,
      maxAttempts: 3,
      runAfter: timeline.backendJobs.running.runAfter,
      lockedAt: timeline.backendJobs.running.startedAt,
      lockedBy: "demo-worker-1",
      startedAt: timeline.backendJobs.running.startedAt,
      createdById: seniorAnalyst.id,
      createdAt: timeline.backendJobs.running.createdAt,
      updatedAt: timeline.backendJobs.running.updatedAt,
      events: {
        create: [
          {
            level: "info",
            message: "Dry-run Salesforce выполняется: проверяется схема Case.",
            metadata: JSON.stringify({ source: "salesforce", status: "RUNNING" }),
            createdAt: timeline.backendJobs.running.eventCreatedAt
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
      runAfter: timeline.backendJobs.cancelled.runAfter,
      createdById: admin.id,
      createdAt: timeline.backendJobs.cancelled.createdAt,
      updatedAt: timeline.backendJobs.cancelled.updatedAt,
      events: {
        create: [
          {
            level: "info",
            message: "Плановая очистка отменена в демо-окружении.",
            metadata: JSON.stringify({ dryRun: true }),
            createdAt: timeline.backendJobs.cancelled.eventCreatedAt
          }
        ]
      }
    }
  });

  await prisma.reportSnapshot.createMany({
    data: [
      {
        workspaceId: workspace.id,
        name: "Месячный отчет качества",
        periodStart: timeline.reportSnapshots.ready.period.start,
        periodEnd: timeline.reportSnapshots.ready.period.end,
        filtersJson: JSON.stringify({ period: "current" }),
        metricsJson: JSON.stringify({ averageScore: 83.7, finalizedCount: 47, highRiskCount: 11 }),
        exportFormat: "xlsx",
        status: "READY",
        filePath: "demo/reports/current-quality.xlsx",
        fileSize: 48763,
        createdById: teamLead.id,
        createdAt: timeline.reportSnapshots.ready.createdAt,
        updatedAt: timeline.reportSnapshots.ready.updatedAt
      },
      {
        workspaceId: workspace.id,
        name: "PDF по открытой очереди",
        periodStart: timeline.reportSnapshots.queue.period.start,
        periodEnd: timeline.reportSnapshots.queue.period.end,
        filtersJson: JSON.stringify({ qaStatus: ["QUEUED", "ASSIGNED", "IN_PROGRESS", "REOPENED"] }),
        metricsJson: JSON.stringify({ queued: 4, assigned: 3, inProgress: 3, reopened: 2 }),
        exportFormat: "pdf",
        status: "QUEUED",
        createdById: analyst.id,
        createdAt: timeline.reportSnapshots.queue.createdAt,
        updatedAt: timeline.reportSnapshots.queue.updatedAt
      },
      {
        workspaceId: workspace.id,
        name: "Срез по интеграциям с ошибками",
        periodStart: timeline.reportSnapshots.failed.period.start,
        periodEnd: timeline.reportSnapshots.failed.period.end,
        filtersJson: JSON.stringify({ section: "integrations", status: "error" }),
        metricsJson: JSON.stringify({ error: "Demo: источник Jira требует обновления токена" }),
        exportFormat: "csv",
        status: "FAILED",
        createdById: admin.id,
        createdAt: timeline.reportSnapshots.failed.createdAt,
        updatedAt: timeline.reportSnapshots.failed.updatedAt
      }
    ]
  });

  const apiToken = await createSeededDemoApiToken(
    process.env,
    prisma.apiToken,
    workspace.id
  );

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
          operationalConversations: operationalConversationRecords.length,
          operationalStatusPlan,
          additionalHumanReviews: analyticalScenario.reviews.length
        }),
        createdAt: timeline.recentActivity[3]
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
        createdAt: at(-25, { hour: 11, minute: 48, second: 20 })
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
          importedCount: 34
        }),
        createdAt: timeline.backendJobs.succeeded.finishedAt
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
        createdAt: timeline.backendJobs.failed.finishedAt
      },
      {
        workspaceId: workspace.id,
        actorId: teamLead.id,
        action: "reports.export_created",
        targetType: "backend_job",
        targetId: reportExportJob.id,
        metadata: JSON.stringify({
          format: "xlsx",
          periodStart: timeline.quotas.current.start.toISOString().slice(0, 10),
          periodEnd: timeline.quotas.current.end.toISOString().slice(0, 10)
        }),
        createdAt: timeline.backendJobs.report.finishedAt
      },
      {
        workspaceId: workspace.id,
        actorId: admin.id,
        action: "backend_job.queued",
        targetType: "backend_job",
        targetId: webhookQueuedJob.id,
        metadata: JSON.stringify({
          type: "WEBHOOK_INGEST",
          source: "generic_webhook"
        }),
        createdAt: timeline.backendJobs.queued.createdAt
      },
      {
        workspaceId: workspace.id,
        actorId: seniorAnalyst.id,
        action: "backend_job.running",
        targetType: "backend_job",
        targetId: runningImportJob.id,
        metadata: JSON.stringify({
          type: "INTEGRATION_IMPORT",
          source: "salesforce"
        }),
        createdAt: timeline.backendJobs.running.startedAt
      },
      {
        workspaceId: workspace.id,
        actorId: teamLead.id,
        action: "training.assignment_created",
        targetType: "training_assignment",
        targetId: "demo-training-batch",
        metadata: JSON.stringify({
          count: 11,
          statuses: ["open", "in_progress", "done"]
        }),
        createdAt: at(-1, { hour: 12, minute: 37 })
      }
    ]
  });
}
