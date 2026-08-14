import type {
  BackendJobStatus,
  ConversationChannel,
  FindingOwnerType,
  ParticipantType,
  QaStatus,
  ReportSnapshotStatus,
  ReviewSource,
  RiskLevel
} from "@prisma/client";
import { daysFrom, type DemoCalendar, type DemoClock } from "./demo-calendar";

export type DemoOperationalSeedContext = {
  analystId: string;
  analystName: string;
  teamLeadId: string;
  teamLeadName: string;
  seniorAnalystId: string;
  seniorAnalystName: string;
  supportAgentName: string;
  supportOlgaName: string;
  supportDenisName: string;
  supportElenaName: string;
};

export type OperationalMessageSeed = {
  participantType: ParticipantType;
  authorName: string;
  body: string;
  sentAt: Date;
  isPrivate?: boolean;
};

export type OperationalReviewSeed = {
  reviewerId: string;
  reviewSource?: ReviewSource;
  totalScore: number;
  summary: string;
  category: string;
  riskLevel: RiskLevel;
  ownerType?: FindingOwnerType;
  positiveNotes?: string;
  finalizedAt?: Date;
  feedbackStatus?: string;
  appealStatus?: string;
  needsReanswer?: boolean;
  reanswerStatus?: string;
  criticalError?: boolean;
  criticalCategory?: string;
};

export type OperationalConversationSeed = {
  externalSource: string;
  externalId: string;
  externalUrl?: string;
  channel: ConversationChannel;
  subject: string;
  status: "open" | "pending" | "solved" | "closed";
  tags: string;
  customerName: string;
  assigneeName?: string;
  qaStatus: Exclude<QaStatus, "FINALIZED">;
  qaAssigneeId?: string | null;
  qaAssigneeName?: string | null;
  reviewDueAt: Date;
  samplingReason: string;
  samplingType: string;
  csatScore: number | null;
  csatBucket: string;
  supportLine: string;
  teamName: string;
  riskHint?: string | null;
  openedAt: Date;
  closedAt?: Date | null;
  messages: OperationalMessageSeed[];
  draftReview?: OperationalReviewSeed;
  previousFinalizedReview?: OperationalReviewSeed;
};

export function buildDemoOperationalStatusPlan() {
  return {
    trainingAssignmentStatuses: ["open", "in_progress", "done"] as const,
    calibrationSessionStatuses: ["draft", "active", "completed", "archived"] as const,
    integrationStatuses: ["active", "ready", "queued", "paused", "error"] as const,
    integrationRunStatuses: ["dry_run_ok", "imported", "queued", "dry_run_queued", "retry_scheduled", "failed"] as const,
    backendJobStatuses: ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const satisfies readonly BackendJobStatus[],
    reportSnapshotStatuses: ["QUEUED", "READY", "FAILED"] as const satisfies readonly ReportSnapshotStatus[]
  };
}

function minutesFrom(base: Date, offset: number) {
  return new Date(base.getTime() + offset * 60 * 1000);
}

export function buildDemoOperationalTimeline(calendar: DemoCalendar) {
  const at = (dayOffset: number, clock: DemoClock = {}) =>
    daysFrom(calendar, dayOffset, clock);
  const beforeNow = (minutes: number) => minutesFrom(calendar.now, -minutes);

  return {
    quotas: {
      previous: calendar.previousVkPeriod,
      current: calendar.currentVkPeriod
    },
    training: {
      open: [
        {
          dueAt: at(-20, { hour: 12 }),
          createdAt: at(-28, { hour: 10, minute: 12 }),
          updatedAt: at(-27, { hour: 9, minute: 34 })
        },
        {
          dueAt: at(-6, { hour: 12 }),
          createdAt: at(-12, { hour: 11, minute: 8 }),
          updatedAt: at(-8, { hour: 15, minute: 21 })
        },
        {
          dueAt: at(-4, { hour: 12 }),
          createdAt: at(-10, { hour: 8, minute: 47 }),
          updatedAt: at(-5, { hour: 16, minute: 3 })
        },
        {
          dueAt: at(-2, { hour: 12 }),
          createdAt: at(-7, { hour: 13, minute: 16 }),
          updatedAt: at(-3, { hour: 10, minute: 28 })
        },
        {
          dueAt: at(-1, { hour: 12 }),
          createdAt: at(-5, { hour: 9, minute: 41 }),
          updatedAt: at(-1, { hour: 18, minute: 7 })
        }
      ],
      inProgress: [
        {
          dueAt: at(0, { hour: 11 }),
          createdAt: at(-4, { hour: 10, minute: 7 }),
          updatedAt: beforeNow(180)
        },
        {
          dueAt: at(1, { hour: 12 }),
          createdAt: at(-3, { hour: 9, minute: 18 }),
          updatedAt: beforeNow(140)
        },
        {
          dueAt: at(2, { hour: 12 }),
          createdAt: at(-2, { hour: 11, minute: 26 }),
          updatedAt: beforeNow(100)
        }
      ],
      done: [
        {
          dueAt: at(-12, { hour: 12 }),
          createdAt: at(-18, { hour: 8, minute: 52 }),
          updatedAt: at(-10, { hour: 14, minute: 23 })
        },
        {
          dueAt: at(-5, { hour: 12 }),
          createdAt: at(-10, { hour: 10, minute: 14 }),
          updatedAt: at(-4, { hour: 16, minute: 37 })
        },
        {
          dueAt: at(-3, { hour: 12 }),
          createdAt: at(-8, { hour: 9, minute: 36 }),
          updatedAt: at(-2, { hour: 11, minute: 42 })
        },
        {
          dueAt: at(-1, { hour: 9 }),
          createdAt: at(-4, { hour: 12, minute: 3 }),
          updatedAt: at(-1, { hour: 18, minute: 11 })
        }
      ]
    },
    calibrations: {
      draft: {
        dueAt: at(5, { hour: 12 }),
        createdAt: at(-2, { hour: 10, minute: 6 }),
        updatedAt: beforeNow(90),
        reviewFinalizedAt: [] as Date[],
        participants: [
          {
            createdAt: at(-2, { hour: 10, minute: 18 }),
            updatedAt: at(-2, { hour: 10, minute: 18 }),
            completedAt: null
          },
          {
            createdAt: at(-2, { hour: 10, minute: 21 }),
            updatedAt: beforeNow(95),
            completedAt: null
          }
        ],
        itemCreatedAt: [
          at(-2, { hour: 10, minute: 27 }),
          at(-2, { hour: 10, minute: 31 })
        ]
      },
      active: {
        dueAt: at(1, { hour: 12 }),
        createdAt: at(-2, { hour: 14, minute: 4 }),
        updatedAt: beforeNow(15),
        reviewFinalizedAt: [
          beforeNow(240),
          beforeNow(180),
          beforeNow(120)
        ],
        participants: [
          {
            createdAt: at(-2, { hour: 14, minute: 19 }),
            updatedAt: beforeNow(60),
            completedAt: beforeNow(60)
          },
          {
            createdAt: at(-2, { hour: 14, minute: 22 }),
            updatedAt: beforeNow(20),
            completedAt: null
          }
        ],
        itemCreatedAt: [
          at(-2, { hour: 14, minute: 11 }),
          at(-2, { hour: 14, minute: 14 })
        ]
      },
      completed: {
        dueAt: at(-3, { hour: 12 }),
        createdAt: at(-8, { hour: 11, minute: 2 }),
        updatedAt: at(-3, { hour: 11, minute: 21 }),
        reviewFinalizedAt: [
          at(-3, { hour: 9, minute: 45 }),
          at(-3, { hour: 10, minute: 20 })
        ],
        participants: [
          {
            createdAt: at(-8, { hour: 11, minute: 16 }),
            updatedAt: at(-3, { hour: 10, minute: 35 }),
            completedAt: at(-3, { hour: 10, minute: 35 })
          },
          {
            createdAt: at(-8, { hour: 11, minute: 19 }),
            updatedAt: at(-3, { hour: 10, minute: 50 }),
            completedAt: at(-3, { hour: 10, minute: 50 })
          }
        ],
        itemCreatedAt: [
          at(-8, { hour: 11, minute: 8 }),
          at(-8, { hour: 11, minute: 11 })
        ]
      },
      archived: {
        dueAt: at(-31, { hour: 12 }),
        createdAt: at(-40, { hour: 9, minute: 7 }),
        updatedAt: at(-30, { hour: 11, minute: 4 }),
        reviewFinalizedAt: [at(-31, { hour: 9, minute: 20 })],
        participants: [
          {
            createdAt: at(-40, { hour: 9, minute: 18 }),
            updatedAt: at(-31, { hour: 10 }),
            completedAt: at(-31, { hour: 10 })
          }
        ],
        itemCreatedAt: [at(-40, { hour: 9, minute: 13 })]
      }
    },
    integrationRuns: {
      dryRun: {
        startedAt: at(-25, { hour: 11, minute: 53 }),
        finishedAt: at(-25, { hour: 11, minute: 58 })
      },
      imported: {
        startedAt: at(-1, { hour: 12, minute: 7 }),
        finishedAt: at(-1, { hour: 12, minute: 13 })
      },
      queued: {
        startedAt: beforeNow(180),
        finishedAt: null
      },
      dryRunQueued: {
        startedAt: at(-1, { hour: 16, minute: 17 }),
        finishedAt: null
      },
      retryScheduled: {
        startedAt: at(-4, { hour: 7, minute: 18 }),
        finishedAt: at(-4, { hour: 7, minute: 21 })
      },
      failed: {
        startedAt: at(-5, { hour: 9, minute: 2 }),
        finishedAt: at(-5, { hour: 9, minute: 4 })
      }
    },
    backendJobs: {
      succeeded: {
        createdAt: at(-25, { hour: 11, minute: 52 }),
        runAfter: at(-25, { hour: 11, minute: 53 }),
        startedAt: at(-25, { hour: 11, minute: 54 }),
        finishedAt: at(-25, { hour: 11, minute: 59 }),
        eventCreatedAt: at(-25, { hour: 12 }),
        updatedAt: at(-25, { hour: 12 })
      },
      failed: {
        createdAt: at(-9, { hour: 8, minute: 57 }),
        runAfter: at(-9, { hour: 8, minute: 59 }),
        startedAt: at(-9, { hour: 9 }),
        finishedAt: at(-9, { hour: 9, minute: 3 }),
        eventCreatedAt: at(-9, { hour: 9, minute: 4 }),
        updatedAt: at(-9, { hour: 9, minute: 4 })
      },
      report: {
        createdAt: at(-1, { hour: 12, minute: 27 }),
        runAfter: at(-1, { hour: 12, minute: 28 }),
        startedAt: at(-1, { hour: 12, minute: 29 }),
        finishedAt: at(-1, { hour: 12, minute: 29, second: 11 }),
        eventCreatedAt: at(-1, { hour: 12, minute: 30 }),
        updatedAt: at(-1, { hour: 12, minute: 30 })
      },
      queued: {
        createdAt: beforeNow(60),
        runAfter: minutesFrom(calendar.now, 30),
        startedAt: null,
        finishedAt: null,
        eventCreatedAt: beforeNow(55),
        updatedAt: beforeNow(55)
      },
      running: {
        createdAt: beforeNow(180),
        runAfter: beforeNow(170),
        startedAt: beforeNow(160),
        finishedAt: null,
        eventCreatedAt: beforeNow(150),
        updatedAt: beforeNow(15)
      },
      cancelled: {
        createdAt: at(-1, { hour: 12, minute: 41 }),
        runAfter: beforeNow(240),
        startedAt: null,
        finishedAt: null,
        eventCreatedAt: beforeNow(180),
        updatedAt: beforeNow(170)
      }
    },
    reportSnapshots: {
      ready: {
        period: calendar.currentVkPeriod,
        createdAt: at(-1, { hour: 12, minute: 29, second: 11 }),
        updatedAt: at(-1, { hour: 12, minute: 31 })
      },
      queue: {
        period: {
          start: calendar.startOfToday,
          end: at(0, { hour: 23, minute: 59, second: 59 })
        },
        createdAt: beforeNow(70),
        updatedAt: beforeNow(60)
      },
      failed: {
        period: {
          start: calendar.rollingSevenDaysStart,
          end: at(0, { hour: 23, minute: 59, second: 59 })
        },
        createdAt: beforeNow(55),
        updatedAt: beforeNow(50)
      }
    },
    authSessions: {
      adminActive: {
        createdAt: at(-1, { hour: 8, minute: 2 }),
        lastSeenAt: at(-1, { hour: 11, minute: 47 }),
        expiresAt: at(5, { hour: 12 })
      },
      analystActive: {
        createdAt: at(-2, { hour: 8, minute: 32 }),
        lastSeenAt: at(-1, { hour: 10, minute: 12 }),
        expiresAt: at(1, { hour: 12 })
      },
      seniorRevoked: {
        createdAt: at(-3, { hour: 8, minute: 33 }),
        lastSeenAt: at(-2, { hour: 15, minute: 29 }),
        revokedAt: at(-2, { hour: 15, minute: 36 }),
        expiresAt: at(2, { hour: 12 })
      },
      agentExpired: {
        createdAt: at(-5, { hour: 8, minute: 3 }),
        lastSeenAt: at(-4, { hour: 11, minute: 49 }),
        expiresAt: at(-4, { hour: 12 })
      }
    },
    messaging: {
      channels: {
        slack: {
          createdAt: at(-30, { hour: 9, minute: 12 }),
          updatedAt: beforeNow(20),
          lastDeliveredAt: beforeNow(90)
        },
        teams: {
          createdAt: at(-20, { hour: 10, minute: 17 }),
          updatedAt: beforeNow(80),
          lastDeliveredAt: null
        }
      },
      deliveries: {
        delivered: {
          createdAt: beforeNow(100),
          deliveredAt: beforeNow(90)
        },
        queued: {
          createdAt: beforeNow(45),
          deliveredAt: null
        },
        failed: {
          createdAt: beforeNow(130),
          deliveredAt: null
        }
      }
    },
    recentActivity: [
      at(-5, { hour: 10, minute: 17 }),
      at(-3, { hour: 16, minute: 8 }),
      at(-2, { hour: 8, minute: 23 }),
      at(-1, { hour: 12, minute: 29, second: 11 }),
      beforeNow(40),
      beforeNow(10)
    ]
  } as const;
}

function message(
  participantType: ParticipantType,
  authorName: string,
  body: string,
  conversationOpenedAt: Date,
  minutesAfterOpen: number
): OperationalMessageSeed {
  return {
    participantType,
    authorName,
    body,
    sentAt: minutesFrom(conversationOpenedAt, minutesAfterOpen)
  };
}

function conversationOpenedAt(calendar: DemoCalendar, dayOffset: number, clock: DemoClock) {
  return daysFrom(calendar, dayOffset, clock);
}

export function buildOperationalConversationSeeds(
  context: DemoOperationalSeedContext,
  calendar: DemoCalendar
): OperationalConversationSeed[] {
  const paymentOpenedAt = conversationOpenedAt(calendar, -2, { hour: 9, minute: 20 });
  const documentsOpenedAt = conversationOpenedAt(calendar, -1, { hour: 10, minute: 10 });
  const tariffOpenedAt = conversationOpenedAt(calendar, -3, { hour: 14 });
  const invoiceOpenedAt = conversationOpenedAt(calendar, -2, { hour: 12, minute: 10 });
  const routingOpenedAt = conversationOpenedAt(calendar, -3, { hour: 8, minute: 20 });
  const bestPracticeOpenedAt = conversationOpenedAt(calendar, -1, { hour: 15, minute: 10 });
  const compensationOpenedAt = conversationOpenedAt(calendar, -6, { hour: 11 });
  const reanswerOpenedAt = conversationOpenedAt(calendar, -7, { hour: 9, minute: 10 });
  const unassignedOpenedAt = conversationOpenedAt(calendar, -1, { hour: 8, minute: 45 });
  const newHireOpenedAt = conversationOpenedAt(calendar, -1, { hour: 16 });
  const privateNoteOpenedAt = conversationOpenedAt(calendar, -2, { hour: 13, minute: 20 });
  const tariffClosedAt = minutesFrom(tariffOpenedAt, 36);
  const invoiceClosedAt = minutesFrom(invoiceOpenedAt, 40);
  const routingClosedAt = minutesFrom(routingOpenedAt, 550);
  const compensationClosedAt = minutesFrom(compensationOpenedAt, 42);
  const reanswerClosedAt = minutesFrom(reanswerOpenedAt, 55);
  const newHireClosedAt = minutesFrom(newHireOpenedAt, 24);

  return [
    {
      externalSource: "zendesk",
      externalId: "ZD-OPEN-7101",
      channel: "EMAIL",
      subject: "Открытый DSAT по повторной оплате",
      status: "open",
      tags: "open,dsat,оплата,очередь",
      customerName: "Тамара Куликова",
      assigneeName: context.supportDenisName,
      qaStatus: "QUEUED",
      qaAssigneeId: null,
      qaAssigneeName: null,
      reviewDueAt: daysFrom(calendar, -2, { hour: 12 }),
      samplingReason: "Негативный CSAT по открытому обращению",
      samplingType: "DSAT",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Клиент повторно пишет до закрытия платежа",
      openedAt: paymentOpenedAt,
      closedAt: null,
      messages: [
        message("CUSTOMER", "Тамара Куликова", "Оплата списалась второй раз, а заказ все еще не активен.", paymentOpenedAt, 0),
        message("HUMAN_AGENT", context.supportDenisName, "Проверяю платеж и передаю запрос в биллинг, вернусь с подтверждением.", paymentOpenedAt, 8)
      ]
    },
    {
      externalSource: "intercom",
      externalId: "INT-OPEN-5201",
      channel: "MESSENGER",
      subject: "Ожидает ответа клиента по документам",
      status: "pending",
      tags: "pending,документы,без-csat",
      customerName: "Руслан Агеев",
      assigneeName: context.supportOlgaName,
      qaStatus: "QUEUED",
      qaAssigneeId: null,
      qaAssigneeName: null,
      reviewDueAt: daysFrom(calendar, 1, { hour: 12 }),
      samplingReason: "Ручной контроль открытого диалога без CSAT",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: documentsOpenedAt,
      closedAt: null,
      messages: [
        message("CUSTOMER", "Руслан Агеев", "Какие документы нужны для продления заявки?", documentsOpenedAt, 0),
        message("HUMAN_AGENT", context.supportOlgaName, "Нужны паспорт, договор и подтверждение оплаты. Жду номер заявки для проверки.", documentsOpenedAt, 6)
      ]
    },
    {
      externalSource: "freshdesk",
      externalId: "FD-ASSIGNED-3301",
      channel: "CHAT",
      subject: "Назначена проверка по смене тарифа",
      status: "closed",
      tags: "assigned,тариф,manual",
      customerName: "Никита Барсуков",
      assigneeName: context.supportElenaName,
      qaStatus: "ASSIGNED",
      qaAssigneeId: context.analystId,
      qaAssigneeName: context.analystName,
      reviewDueAt: daysFrom(calendar, -1, { hour: 12 }),
      samplingReason: "Ручной аудит спорного тарифа",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      riskHint: "Неясно объяснена смена условий",
      openedAt: tariffOpenedAt,
      closedAt: tariffClosedAt,
      messages: [
        message("CUSTOMER", "Никита Барсуков", "Почему условия тарифа изменились без предупреждения?", tariffOpenedAt, 0),
        message("HUMAN_AGENT", context.supportElenaName, "Условия обновились после окончания промо-периода, сейчас пришлю расчет.", tariffOpenedAt, 18)
      ]
    },
    {
      externalSource: "hubspot",
      externalId: "HS-ASSIGNED-4401",
      channel: "TICKET",
      subject: "Назначена проверка после сигнала руководителя",
      status: "solved",
      tags: "assigned,lead_signal,счет",
      customerName: "Лидия Чернова",
      assigneeName: context.supportDenisName,
      qaStatus: "ASSIGNED",
      qaAssigneeId: context.seniorAnalystId,
      qaAssigneeName: context.seniorAnalystName,
      reviewDueAt: daysFrom(calendar, 2, { hour: 12 }),
      samplingReason: "Сигнал руководителя по счетам",
      samplingType: "LEAD_SIGNAL",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      openedAt: invoiceOpenedAt,
      closedAt: invoiceClosedAt,
      messages: [
        message("CUSTOMER", "Лидия Чернова", "Нужна расшифровка счета по двум позициям.", invoiceOpenedAt, 0),
        message("HUMAN_AGENT", context.supportDenisName, "Сверил позиции и отправил расшифровку отдельным письмом.", invoiceOpenedAt, 40)
      ]
    },
    {
      externalSource: "otrs_family",
      externalId: "OTRS-INPROGRESS-2701",
      channel: "EMAIL",
      subject: "Проверка в работе: неверная маршрутизация",
      status: "closed",
      tags: "in_progress,маршрутизация,critical",
      customerName: "Олег Третьяков",
      assigneeName: context.supportAgentName,
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: context.analystId,
      qaAssigneeName: context.analystName,
      reviewDueAt: daysFrom(calendar, -2, { hour: 12 }),
      samplingReason: "Низкая оценка маршрутизации",
      samplingType: "LOW_SCORE",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Владелец обращения не был назван",
      openedAt: routingOpenedAt,
      closedAt: routingClosedAt,
      messages: [
        message("CUSTOMER", "Олег Третьяков", "Меня снова отправили в другой отдел, срок уже прошел.", routingOpenedAt, 0),
        message("HUMAN_AGENT", context.supportAgentName, "Передал обращение коллегам, они проверят.", routingOpenedAt, 550)
      ],
      draftReview: {
        reviewerId: context.analystId,
        totalScore: 61,
        summary: "Черновик: нужно проверить потерю владельца и корректность маршрутизации.",
        category: "Неверная маршрутизация",
        riskLevel: "HIGH",
        ownerType: "PROCESS",
        positiveNotes: "Тон без конфликта, но процесс требует разбора."
      }
    },
    {
      externalSource: "custom_api",
      externalId: "API-INPROGRESS-1151",
      channel: "CHAT",
      subject: "Проверка в работе: позитивный сложный кейс",
      status: "open",
      tags: "in_progress,best-practice,сложный-кейс",
      customerName: "Софья Кравцова",
      assigneeName: context.supportOlgaName,
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: context.seniorAnalystId,
      qaAssigneeName: context.seniorAnalystName,
      reviewDueAt: daysFrom(calendar, 3, { hour: 12 }),
      samplingReason: "Позитивный пример для базы знаний",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: bestPracticeOpenedAt,
      closedAt: null,
      messages: [
        message("CUSTOMER", "Софья Кравцова", "Нужно объединить несколько заявок и не потерять сроки.", bestPracticeOpenedAt, 0),
        message("HUMAN_AGENT", context.supportOlgaName, "Собрала заявки в один список, отметила сроки и владельцев по каждой.", bestPracticeOpenedAt, 25)
      ],
      draftReview: {
        reviewerId: context.seniorAnalystId,
        totalScore: 94,
        summary: "Черновик позитивного примера: сильная структура ответа и контроль владельцев.",
        category: "Сложный кейс",
        riskLevel: "LOW",
        positiveNotes: "Подходит для разбора как хорошая практика."
      }
    },
    {
      externalSource: "zendesk",
      externalId: "ZD-REOPENED-7201",
      channel: "TICKET",
      subject: "Переоткрыта после апелляции по компенсации",
      status: "pending",
      tags: "reopened,appeal,компенсация",
      customerName: "Василиса Гущина",
      assigneeName: context.supportElenaName,
      qaStatus: "REOPENED",
      qaAssigneeId: context.teamLeadId,
      qaAssigneeName: context.teamLeadName,
      reviewDueAt: daysFrom(calendar, 0, { hour: 16 }),
      samplingReason: "Переоткрыто после апелляции оператора",
      samplingType: "LEAD_SIGNAL",
      csatScore: 3,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      riskHint: "Нужно уточнить правило компенсаций",
      openedAt: compensationOpenedAt,
      closedAt: compensationClosedAt,
      messages: [
        message("CUSTOMER", "Василиса Гущина", "Компенсация не отразилась после обращения.", compensationOpenedAt, 0),
        message("HUMAN_AGENT", context.supportElenaName, "Компенсация будет рассчитана по условиям акции.", compensationOpenedAt, 42)
      ],
      previousFinalizedReview: {
        reviewerId: context.analystId,
        totalScore: 72,
        summary: "Первичная проверка: условия акции не были сверены с конкретным заказом.",
        category: "Проверка условий",
        riskLevel: "HIGH",
        ownerType: "POLICY",
        finalizedAt: minutesFrom(compensationClosedAt, 1338),
        feedbackStatus: "appeal",
        appealStatus: "open",
        needsReanswer: true,
        reanswerStatus: "requested"
      }
    },
    {
      externalSource: "freshdesk",
      externalId: "FD-REOPENED-3401",
      channel: "CHAT",
      subject: "Переоткрыта после корректировки переответа",
      status: "closed",
      tags: "reopened,переответ,документы",
      customerName: "Артем Савин",
      assigneeName: context.supportAgentName,
      qaStatus: "REOPENED",
      qaAssigneeId: context.analystId,
      qaAssigneeName: context.analystName,
      reviewDueAt: daysFrom(calendar, -3, { hour: 12 }),
      samplingReason: "Повторный цикл после переответа",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Переответ нужно сверить до отправки",
      openedAt: reanswerOpenedAt,
      closedAt: reanswerClosedAt,
      messages: [
        message("CUSTOMER", "Артем Савин", "Документы снова не пришли, мне нужен точный срок.", reanswerOpenedAt, 0),
        message("HUMAN_AGENT", context.supportAgentName, "Документы появятся позже, ожидайте уведомление.", reanswerOpenedAt, 55)
      ],
      previousFinalizedReview: {
        reviewerId: context.seniorAnalystId,
        totalScore: 54,
        summary: "Первичная проверка: нет фактической проверки статуса документов и срока отправки.",
        category: "Полнота решения",
        riskLevel: "CRITICAL",
        finalizedAt: minutesFrom(reanswerClosedAt, 1405),
        feedbackStatus: "corrected",
        appealStatus: "corrected",
        needsReanswer: true,
        reanswerStatus: "completed",
        criticalError: true,
        criticalCategory: "Отсутствует срок по критичному документу"
      }
    },
    {
      externalSource: "hubspot",
      externalId: "HS-QUEUED-4501",
      channel: "EMAIL",
      subject: "Без назначенного оператора и проверяющего",
      status: "open",
      tags: "queued,unassigned,счет",
      customerName: "Глеб Носов",
      qaStatus: "QUEUED",
      qaAssigneeId: null,
      qaAssigneeName: null,
      reviewDueAt: daysFrom(calendar, -1, { hour: 18 }),
      samplingReason: "Автоматическая выборка без владельца",
      samplingType: "RANDOM",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Нужно назначить владельца обращения",
      openedAt: unassignedOpenedAt,
      closedAt: null,
      messages: [
        message("CUSTOMER", "Глеб Носов", "Кто сможет подтвердить корректность счета?", unassignedOpenedAt, 0),
        message("SYSTEM", "Система", "Обращение импортировано без назначенного оператора.", unassignedOpenedAt, 1)
      ]
    },
    {
      externalSource: "intercom",
      externalId: "INT-ASSIGNED-5301",
      channel: "MESSENGER",
      subject: "Назначена проверка по новичку",
      status: "solved",
      tags: "assigned,new_hire,чат",
      customerName: "Евгения Ширяева",
      assigneeName: context.supportAgentName,
      qaStatus: "ASSIGNED",
      qaAssigneeId: context.teamLeadId,
      qaAssigneeName: context.teamLeadName,
      reviewDueAt: daysFrom(calendar, 4, { hour: 12 }),
      samplingReason: "Контроль нового оператора",
      samplingType: "NEW_HIRE",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      openedAt: newHireOpenedAt,
      closedAt: newHireClosedAt,
      messages: [
        message("CUSTOMER", "Евгения Ширяева", "Помогите перенести запись на утро пятницы.", newHireOpenedAt, 0),
        message("HUMAN_AGENT", context.supportAgentName, "Перенес запись на пятницу 09:30 и отправил подтверждение.", newHireOpenedAt, 24)
      ]
    },
    {
      externalSource: "custom_api",
      externalId: "API-INPROGRESS-1152",
      channel: "TICKET",
      subject: "Проверка в работе по приватным комментариям",
      status: "pending",
      tags: "in_progress,private-note,процесс",
      customerName: "Инга Ларионова",
      assigneeName: context.supportDenisName,
      qaStatus: "IN_PROGRESS",
      qaAssigneeId: context.teamLeadId,
      qaAssigneeName: context.teamLeadName,
      reviewDueAt: daysFrom(calendar, 0, { hour: 12 }),
      samplingReason: "Сигнал по приватным комментариям",
      samplingType: "LEAD_SIGNAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Нужно проверить корректность внутренней заметки",
      openedAt: privateNoteOpenedAt,
      closedAt: null,
      messages: [
        message("CUSTOMER", "Инга Ларионова", "Не понимаю, почему статус договора снова изменился.", privateNoteOpenedAt, 0),
        {
          ...message("SYSTEM", "Внутренняя заметка", "Проверить, не ушла ли клиенту служебная формулировка.", privateNoteOpenedAt, 5),
          isPrivate: true
        },
        message("HUMAN_AGENT", context.supportDenisName, "Сверяю договор и вернусь с понятным статусом.", privateNoteOpenedAt, 12)
      ],
      draftReview: {
        reviewerId: context.teamLeadId,
        totalScore: 79,
        summary: "Черновик: проверить приватную заметку и полноту следующего шага.",
        category: "Работа в обращении",
        riskLevel: "MEDIUM",
        ownerType: "PROCESS"
      }
    }
  ];
}
