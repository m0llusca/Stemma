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

function date(value: string) {
  return new Date(value);
}

function message(participantType: ParticipantType, authorName: string, body: string, sentAt: string): OperationalMessageSeed {
  return {
    participantType,
    authorName,
    body,
    sentAt: date(sentAt)
  };
}

export function buildOperationalConversationSeeds(context: DemoOperationalSeedContext): OperationalConversationSeed[] {
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
      reviewDueAt: date("2026-05-25T12:00:00.000Z"),
      samplingReason: "Негативный CSAT по открытому обращению",
      samplingType: "DSAT",
      csatScore: 1,
      csatBucket: "NEGATIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Клиент повторно пишет до закрытия платежа",
      openedAt: date("2026-05-25T09:20:00.000Z"),
      closedAt: null,
      messages: [
        message("CUSTOMER", "Тамара Куликова", "Оплата списалась второй раз, а заказ все еще не активен.", "2026-05-25T09:20:00.000Z"),
        message("HUMAN_AGENT", context.supportDenisName, "Проверяю платеж и передаю запрос в биллинг, вернусь с подтверждением.", "2026-05-25T09:28:00.000Z")
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
      reviewDueAt: date("2026-05-28T12:00:00.000Z"),
      samplingReason: "Ручной контроль открытого диалога без CSAT",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: date("2026-05-26T10:10:00.000Z"),
      closedAt: null,
      messages: [
        message("CUSTOMER", "Руслан Агеев", "Какие документы нужны для продления заявки?", "2026-05-26T10:10:00.000Z"),
        message("HUMAN_AGENT", context.supportOlgaName, "Нужны паспорт, договор и подтверждение оплаты. Жду номер заявки для проверки.", "2026-05-26T10:16:00.000Z")
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
      reviewDueAt: date("2026-05-26T12:00:00.000Z"),
      samplingReason: "Ручной аудит спорного тарифа",
      samplingType: "MANUAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      riskHint: "Неясно объяснена смена условий",
      openedAt: date("2026-05-24T14:00:00.000Z"),
      closedAt: date("2026-05-24T14:36:00.000Z"),
      messages: [
        message("CUSTOMER", "Никита Барсуков", "Почему условия тарифа изменились без предупреждения?", "2026-05-24T14:00:00.000Z"),
        message("HUMAN_AGENT", context.supportElenaName, "Условия обновились после окончания промо-периода, сейчас пришлю расчет.", "2026-05-24T14:18:00.000Z")
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
      reviewDueAt: date("2026-05-29T12:00:00.000Z"),
      samplingReason: "Сигнал руководителя по счетам",
      samplingType: "LEAD_SIGNAL",
      csatScore: 4,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      openedAt: date("2026-05-25T12:10:00.000Z"),
      closedAt: date("2026-05-25T12:50:00.000Z"),
      messages: [
        message("CUSTOMER", "Лидия Чернова", "Нужна расшифровка счета по двум позициям.", "2026-05-25T12:10:00.000Z"),
        message("HUMAN_AGENT", context.supportDenisName, "Сверил позиции и отправил расшифровку отдельным письмом.", "2026-05-25T12:50:00.000Z")
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
      reviewDueAt: date("2026-05-25T12:00:00.000Z"),
      samplingReason: "Низкая оценка маршрутизации",
      samplingType: "LOW_SCORE",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Владелец обращения не был назван",
      openedAt: date("2026-05-24T08:20:00.000Z"),
      closedAt: date("2026-05-24T17:30:00.000Z"),
      messages: [
        message("CUSTOMER", "Олег Третьяков", "Меня снова отправили в другой отдел, срок уже прошел.", "2026-05-24T08:20:00.000Z"),
        message("HUMAN_AGENT", context.supportAgentName, "Передал обращение коллегам, они проверят.", "2026-05-24T17:30:00.000Z")
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
      reviewDueAt: date("2026-05-30T12:00:00.000Z"),
      samplingReason: "Позитивный пример для базы знаний",
      samplingType: "RANDOM",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "1ЛП",
      teamName: "ФГИС",
      openedAt: date("2026-05-26T15:10:00.000Z"),
      closedAt: null,
      messages: [
        message("CUSTOMER", "Софья Кравцова", "Нужно объединить несколько заявок и не потерять сроки.", "2026-05-26T15:10:00.000Z"),
        message("HUMAN_AGENT", context.supportOlgaName, "Собрала заявки в один список, отметила сроки и владельцев по каждой.", "2026-05-26T15:35:00.000Z")
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
      reviewDueAt: date("2026-05-27T16:00:00.000Z"),
      samplingReason: "Переоткрыто после апелляции оператора",
      samplingType: "LEAD_SIGNAL",
      csatScore: 3,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "Личный кабинет",
      riskHint: "Нужно уточнить правило компенсаций",
      openedAt: date("2026-05-21T11:00:00.000Z"),
      closedAt: date("2026-05-21T11:42:00.000Z"),
      messages: [
        message("CUSTOMER", "Василиса Гущина", "Компенсация не отразилась после обращения.", "2026-05-21T11:00:00.000Z"),
        message("HUMAN_AGENT", context.supportElenaName, "Компенсация будет рассчитана по условиям акции.", "2026-05-21T11:42:00.000Z")
      ],
      previousFinalizedReview: {
        reviewerId: context.analystId,
        totalScore: 72,
        summary: "Первичная проверка: условия акции не были сверены с конкретным заказом.",
        category: "Проверка условий",
        riskLevel: "HIGH",
        ownerType: "POLICY",
        finalizedAt: date("2026-05-22T10:00:00.000Z"),
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
      reviewDueAt: date("2026-05-24T12:00:00.000Z"),
      samplingReason: "Повторный цикл после переответа",
      samplingType: "DSAT",
      csatScore: 2,
      csatBucket: "NEGATIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      riskHint: "Переответ нужно сверить до отправки",
      openedAt: date("2026-05-20T09:10:00.000Z"),
      closedAt: date("2026-05-20T10:05:00.000Z"),
      messages: [
        message("CUSTOMER", "Артем Савин", "Документы снова не пришли, мне нужен точный срок.", "2026-05-20T09:10:00.000Z"),
        message("HUMAN_AGENT", context.supportAgentName, "Документы появятся позже, ожидайте уведомление.", "2026-05-20T10:05:00.000Z")
      ],
      previousFinalizedReview: {
        reviewerId: context.seniorAnalystId,
        totalScore: 54,
        summary: "Первичная проверка: нет фактической проверки статуса документов и срока отправки.",
        category: "Полнота решения",
        riskLevel: "CRITICAL",
        finalizedAt: date("2026-05-21T09:30:00.000Z"),
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
      reviewDueAt: date("2026-05-26T18:00:00.000Z"),
      samplingReason: "Автоматическая выборка без владельца",
      samplingType: "RANDOM",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Нужно назначить владельца обращения",
      openedAt: date("2026-05-26T08:45:00.000Z"),
      closedAt: null,
      messages: [
        message("CUSTOMER", "Глеб Носов", "Кто сможет подтвердить корректность счета?", "2026-05-26T08:45:00.000Z"),
        message("SYSTEM", "Система", "Обращение импортировано без назначенного оператора.", "2026-05-26T08:46:00.000Z")
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
      reviewDueAt: date("2026-05-31T12:00:00.000Z"),
      samplingReason: "Контроль нового оператора",
      samplingType: "NEW_HIRE",
      csatScore: 5,
      csatBucket: "POSITIVE",
      supportLine: "2ЛП",
      teamName: "ФГИС",
      openedAt: date("2026-05-26T16:00:00.000Z"),
      closedAt: date("2026-05-26T16:24:00.000Z"),
      messages: [
        message("CUSTOMER", "Евгения Ширяева", "Помогите перенести запись на утро пятницы.", "2026-05-26T16:00:00.000Z"),
        message("HUMAN_AGENT", context.supportAgentName, "Перенес запись на пятницу 09:30 и отправил подтверждение.", "2026-05-26T16:24:00.000Z")
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
      reviewDueAt: date("2026-05-27T12:00:00.000Z"),
      samplingReason: "Сигнал по приватным комментариям",
      samplingType: "LEAD_SIGNAL",
      csatScore: null,
      csatBucket: "NO_SCORE",
      supportLine: "1ЛП",
      teamName: "Коммерческие сервисы",
      riskHint: "Нужно проверить корректность внутренней заметки",
      openedAt: date("2026-05-25T13:20:00.000Z"),
      closedAt: null,
      messages: [
        message("CUSTOMER", "Инга Ларионова", "Не понимаю, почему статус договора снова изменился.", "2026-05-25T13:20:00.000Z"),
        {
          ...message("SYSTEM", "Внутренняя заметка", "Проверить, не ушла ли клиенту служебная формулировка.", "2026-05-25T13:25:00.000Z"),
          isPrivate: true
        },
        message("HUMAN_AGENT", context.supportDenisName, "Сверяю договор и вернусь с понятным статусом.", "2026-05-25T13:32:00.000Z")
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
