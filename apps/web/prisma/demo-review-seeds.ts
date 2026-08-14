import type {
  ConversationChannel,
  FindingOwnerType,
  RiskLevel
} from "@prisma/client";
import {
  daysFrom,
  type DemoCalendar
} from "./demo-calendar";
import { buildReportCatalogSlug } from "../src/lib/reports/report-filter-slug";
import { serializeReportAnalysisState } from "../src/lib/reports/report-analysis-state";

export type DemoCriterionSeed = {
  id: string;
  key: string;
  label: string;
  blockKey: string;
  block: string;
  weight: number;
  order: number;
};

export type DemoCriterionValueSeed = {
  id: string;
  criterionId: string;
  criterionKey: string;
  value: number;
  evidenceMessageId: string;
};

export type ReviewedConversationSeed = {
  window: "previous" | "current";
  slot: number;
  conversationId: string;
  reviewId: string;
  findingId: string;
  coachingActionId: string | null;
  coachingDueAt: Date | null;
  operatorId: string;
  teamSlug: string;
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
  sentiment: null;
  openedAt: Date;
  closedAt: Date;
  customerMessage: string;
  customerFollowUp?: string;
  agentMessage: string;
  customerMessageId: string;
  agentMessageId: string;
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
  feedbackAckAt?: Date | null;
  appealStatus?: string;
  positiveNotes?: string;
  criterionValues: DemoCriterionValueSeed[];
};

export type DemoReviewSeedContext = {
  analystId: string;
  teamLeadId: string;
  seniorAnalystId: string;
  supportAgentName: string;
  supportOlgaName: string;
  supportDenisName: string;
  supportElenaName: string;
};

export type DemoAiCriterionSeed = {
  criterionId: string;
  criterionKey: string;
  value: number;
  confidence: number;
  rationale: string;
  evidenceRef: string;
};

export type DemoAiDraftSeed = {
  id: string;
  reviewId: string;
  conversationId: string;
  evidenceMessageId: string;
  createdAt: Date;
  modelVersion: string;
  promptVersion: string;
  confidence: number;
  criteria: DemoAiCriterionSeed[];
};

export type DemoQuotaSeed = {
  id: string;
  operatorId: string;
  assigneeName: string;
  supportLine: string;
  plannedCount: number;
};

export type DemoEvidenceFactor =
  | "freshdesk-processes"
  | "zendesk-improvement"
  | "declining-team"
  | "ai-drift"
  | "high-plus";

export type DemoAnalyticalScenario = {
  reviews: ReviewedConversationSeed[];
  criteria: DemoCriterionSeed[];
  aiDrafts: DemoAiDraftSeed[];
  quotas: DemoQuotaSeed[];
  evidence: Record<DemoEvidenceFactor, string[]>;
  savedViews: DemoSavedReportViewSeed[];
  aiStory: {
    confidenceDrops: number;
    fallbackSpikes: number;
    weekly: Array<{ confidence: number; fallbackShare: number }>;
  };
};

export type DemoSavedReportViewSeed = {
  id: string;
  name: string;
  href: string;
  scope: "shared";
  order: number;
};

const dayMs = 24 * 60 * 60 * 1000;

export const demoWindowSlotCount = 42;

export const demoReanswerSlots: readonly number[] = [3, 14, 18, 32];

export const demoReanswerReviewIds = demoReanswerSlots.map(
  (slot) => `demo-review-c${String(slot).padStart(2, "0")}`
);

export const demoCriteria: readonly DemoCriterionSeed[] = [
  ["accuracy", "Точность ответа", "resolution", "Решение обращения", 10],
  ["completeness", "Полнота решения", "resolution", "Решение обращения", 8],
  ["context", "Контекст обращения", "resolution", "Решение обращения", 7],
  ["next_step", "Следующий шаг", "resolution", "Решение обращения", 7],
  ["routing", "Маршрутизация", "processes", "Процессы", 7],
  ["ticket_work", "Работа в обращении", "processes", "Процессы", 6],
  ["cross_team", "Работа со смежными отделами", "processes", "Процессы", 6],
  ["sla_ownership", "Владелец и срок", "processes", "Процессы", 6],
  ["style", "Стиль и ясность", "communication", "Коммуникация", 7],
  ["empathy", "Эмпатия", "communication", "Коммуникация", 6],
  ["grammar", "Грамотность", "communication", "Коммуникация", 5],
  ["personalization", "Персонализация", "communication", "Коммуникация", 5],
  ["policy", "Соблюдение политики", "risk-management", "Работа с риском", 6],
  ["data_safety", "Защита данных", "risk-management", "Работа с риском", 5],
  ["verification", "Проверка условий", "risk-management", "Работа с риском", 5],
  ["escalation", "Эскалация риска", "risk-management", "Работа с риском", 4]
].map(([key, label, blockKey, block, weight], index) => ({
  id: `demo-criterion-${key}`,
  key: String(key),
  label: String(label),
  blockKey: String(blockKey),
  block: String(block),
  weight: Number(weight),
  order: index + 1
}));

const sourcePlan = [
  { source: "freshdesk", count: 8 },
  { source: "zendesk", count: 8 },
  { source: "otrs_family", count: 7 },
  { source: "intercom", count: 6 },
  { source: "hubspot", count: 5 },
  { source: "demo_import", count: 5 },
  { source: "custom_api", count: 3 }
] as const;

const sourceScores = {
  previous: {
    freshdesk: [92, 90, 91, 89, 93, 90, 91, 88],
    zendesk: [74, 76, 75, 77, 73, 78, 76, 75],
    otrs_family: [94, 88, 82, 76, 70, 64, 48],
    intercom: [91, 85, 79, 73, 67, 54],
    hubspot: [89, 83, 77, 71, 65],
    demo_import: [95, 86, 74, 62, 45],
    custom_api: [88, 80, 72]
  },
  current: {
    freshdesk: [78, 80, 79, 77, 81, 78, 79, 76],
    zendesk: [82, 84, 83, 85, 81, 86, 84, 83],
    otrs_family: [93, 87, 81, 75, 69, 63, 46],
    intercom: [90, 84, 78, 72, 66, 52],
    hubspot: [90, 84, 78, 72, 66],
    demo_import: [94, 85, 73, 61, 44],
    custom_api: [87, 79, 71]
  }
} as const;

const operators = [
  ["demo-operator-01", "Иван Петров", "process-escalations", "Процессные эскалации", "2ЛП"],
  ["demo-operator-02", "Ольга Иванова", "process-escalations", "Процессные эскалации", "1ЛП"],
  ["demo-operator-03", "Денис Соколов", "process-escalations", "Процессные эскалации", "1ЛП"],
  ["demo-operator-04", "Елена Морозова", "process-escalations", "Процессные эскалации", "2ЛП"],
  ["demo-operator-05", "Александр Ким", "fgis-services", "ФГИС и государственные сервисы", "1ЛП"],
  ["demo-operator-06", "Надежда Орлова", "fgis-services", "ФГИС и государственные сервисы", "1ЛП"],
  ["demo-operator-07", "Михаил Громов", "fgis-services", "ФГИС и государственные сервисы", "2ЛП"],
  ["demo-operator-08", "Софья Беляева", "fgis-services", "ФГИС и государственные сервисы", "2ЛП"],
  ["demo-operator-09", "Роман Тихонов", "account-commerce", "Личный кабинет и коммерческие услуги", "1ЛП"],
  ["demo-operator-10", "Алина Бородина", "account-commerce", "Личный кабинет и коммерческие услуги", "1ЛП"],
  ["demo-operator-11", "Екатерина Александровна Вышеславцева", "account-commerce", "Личный кабинет и коммерческие услуги", "2ЛП"],
  ["demo-operator-12", "Тимофей Нестеров", "account-commerce", "Личный кабинет и коммерческие услуги", "2ЛП"]
].map(([id, name, teamSlug, teamName, supportLine]) => ({
  id,
  name,
  teamSlug,
  teamName,
  supportLine
}));

const categories = [
  "Полнота решения",
  "Следующий шаг",
  "Неверная маршрутизация",
  "Работа в обращении",
  "Стиль и ясность",
  "Эмпатия",
  "Персонализация",
  "Проверка условий",
  "Политика данных",
  "Эскалация риска"
];

const subjects = [
  "Не обновился статус заявления после отправки документов",
  "Код подтверждения не приходит после смены номера",
  "Промокод не применился к продлению подписки",
  "Запись на услугу перенесена без уведомления",
  "Закрывающие документы не появились в кабинете",
  "Обращение передают между линиями без владельца",
  "Стоимость тарифа изменилась после автопродления",
  "Ответ в мессенджере пришёл после истечения SLA",
  "Ссылка в инструкции ведёт на архивную страницу",
  "В договоре не учтены согласованные изменения",
  "Шаблон ответа не учитывает тип заявления",
  "Запрос на удаление персональных данных без статуса",
  "Платёж прошёл, но услуга осталась заблокированной",
  "Повторный запрос документов после успешной проверки",
  "Заявление вернули без объяснения причины",
  "Компенсация рассчитана по устаревшим условиям",
  "Эскалация закрыта до ответа профильного отдела",
  "Оператор не указал срок следующего обновления",
  "Личный кабинет показывает противоречивые статусы",
  "Уведомление об отказе пришло без дальнейших шагов",
  "Дубликат обращения попал в разные очереди",
  "Файл подтверждения не прикрепился к заявлению",
  "История переписки пропала после объединения тикетов",
  "Ответ не содержит обязательного основания решения",
  "Маршрут обращения изменился после повторного открытия",
  "Клиенту предложили недоступный канал подтверждения",
  "Срок обработки указан без учёта рабочего календаря",
  "Согласование зависло между коммерческим и техническим блоком",
  "Оператор закрыл обращение до подтверждения клиента",
  "Инструкция не соответствует текущей версии интерфейса",
  "Чувствительные данные процитированы в открытом комментарии",
  "Переответ не устранил исходную ошибку маршрутизации",
  "Запрос попал в ручную очередь без объяснения причины",
  "В ответе отсутствует ссылка на публичный регламент",
  "Клиент повторно сообщил уже проверенные сведения",
  "Сервисный запрос ошибочно отмечен как коммерческий",
  "Системная подсказка расходится с решением специалиста",
  "Апелляция открыта без конкретного оспариваемого критерия",
  "Обращение закрыто с неподтверждённым результатом проверки",
  "Длинное имя оператора ломает строку ответственного",
  "Недостаточная выборка по редкому источнику custom API",
  "Повторное обращение по неверной маршрутизации заявления между смежными подразделениями"
];

const customerNames = [
  "Наталья Белова",
  "Аркадий Лебедев",
  "Полина Сафонова",
  "Марина Котова",
  "Роман Ильин",
  "Егор Селезнев",
  "Илья Макаров",
  "Вера Громова"
];

function riskForScore(totalScore: number): RiskLevel {
  if (totalScore < 55) return "CRITICAL";
  if (totalScore < 75) return "HIGH";
  if (totalScore < 85) return "MEDIUM";
  return "LOW";
}

function channelForSource(source: string): ConversationChannel {
  if (source === "intercom") return "MESSENGER";
  if (source === "zendesk" || source === "hubspot") return "EMAIL";
  if (source === "otrs_family" || source === "freshdesk") return "TICKET";
  return "CHAT";
}

// Восстановленный сценарий OTRS-2602: конвертирует слот c18 (otrs_family, уже
// апелляционный), поэтому все границы манифеста и раскладка апелляций не меняются.
const otrs2602Fixture: {
  externalId: string;
  channel: ConversationChannel;
  subject: string;
  tags: string;
  customerName: string;
  teamName: string;
  riskHint: string;
  customerMessage: string;
  agentMessage: string;
  totalScore: number;
  summary: string;
  category: string;
  riskLevel: RiskLevel;
  criticalCategory: string;
  appealStatus: string;
} = {
  externalId: "OTRS-2602",
  channel: "EMAIL",
  subject: "Неверный отдел для технической ошибки",
  tags: "маршрутизация,critical,переответ",
  customerName: "Илья Макаров",
  teamName: "ФГИС и государственные сервисы",
  riskHint: "Потеря SLA из-за неверной маршрутизации",
  customerMessage: "Ошибка не исправлена, меня переводят между отделами.",
  agentMessage: "Оператор передал обращение в неверную очередь без объяснения причины.",
  totalScore: 58,
  summary: "Критическая маршрутизация: клиент не получил владельца и срок исправления.",
  category: "Неверная маршрутизация",
  riskLevel: "CRITICAL",
  criticalCategory: "Неверная маршрутизация с потерей SLA",
  appealStatus: "calibration"
};

function sourceAtSlot(slot: number) {
  let cursor = 0;
  for (const entry of sourcePlan) {
    cursor += entry.count;
    if (slot <= cursor) return entry.source;
  }
  throw new Error(`Missing demo source for slot ${slot}`);
}

function scoreAtSlot(window: "previous" | "current", slot: number) {
  const source = sourceAtSlot(slot);
  const before = sourcePlan
    .slice(0, sourcePlan.findIndex((entry) => entry.source === source))
    .reduce((total, entry) => total + entry.count, 0);
  return sourceScores[window][source][slot - before - 1];
}

function operatorAtSlot(window: "previous" | "current", slot: number) {
  if (window === "previous") return operators[(slot - 1) % operators.length];
  if (slot <= 12) return operators[0];
  if (slot <= 23) return operators[1];
  if (slot <= 25) return operators[2];
  if (slot <= 27) return operators[3];
  if (slot <= 29) return operators[4];
  if (slot <= 31) return operators[5];
  if (slot <= 33) return operators[6];
  if (slot <= 35) return operators[7];
  if (slot <= 37) return operators[8];
  if (slot <= 39) return operators[9];
  if (slot === 40) return operators[10];
  return operators[11];
}

function scoreValue(totalScore: number) {
  if (totalScore >= 85) return 3;
  if (totalScore >= 65) return 2;
  return 1;
}

function criterionValues(
  window: "previous" | "current",
  slot: number,
  totalScore: number,
  agentMessageId: string
) {
  const source = sourceAtSlot(slot);
  const processPattern =
    source === "freshdesk"
      ? window === "previous"
        ? [3, 3, 3, 2]
        : [2, 2, 2, 1]
      : null;

  return demoCriteria.map((criterion, index) => {
    const processIndex = demoCriteria
      .filter((entry) => entry.blockKey === "processes")
      .findIndex((entry) => entry.id === criterion.id);
    const value =
      processPattern && processIndex >= 0
        ? processPattern[processIndex]
        : Math.max(1, Math.min(3, scoreValue(totalScore) + ((slot + index) % 7 === 0 ? -1 : 0)));

    return {
      id: `demo-score-${window === "previous" ? "p" : "c"}${String(slot).padStart(2, "0")}-${criterion.key}`,
      criterionId: criterion.id,
      criterionKey: criterion.key,
      value,
      evidenceMessageId: agentMessageId
    };
  });
}

function buildReview(
  context: DemoReviewSeedContext,
  calendar: DemoCalendar,
  window: "previous" | "current",
  slot: number
): ReviewedConversationSeed {
  const code = `${window === "previous" ? "p" : "c"}${String(slot).padStart(2, "0")}`;
  const dateOffsets = [0, 4, 11, 18, 25, 30, 34];
  const timeIndex = (slot - 1) % 6;
  const dayIndex = Math.floor((slot - 1) / 6);
  const windowOffset = window === "previous" ? -69 : -34;
  let dateOffset = dateOffsets[dayIndex];
  const plannedLastCurrentSlot = daysFrom(calendar, windowOffset + 34, {
    hour: 11,
    minute: 35
  });
  if (
    window === "current" &&
    dayIndex === dateOffsets.length - 1 &&
    plannedLastCurrentSlot > calendar.now
  ) {
    dateOffset = 33;
  }
  const finalizedAt = daysFrom(calendar, windowOffset + dateOffset, {
    hour: 9,
    minute: 5 + timeIndex * 30
  });
  const totalScore = scoreAtSlot(window, slot);
  const fixture = window === "current" && slot === 18 ? otrs2602Fixture : null;
  const effectiveTotalScore = fixture?.totalScore ?? totalScore;
  const riskLevel = fixture?.riskLevel ?? riskForScore(effectiveTotalScore);
  const operator = operatorAtSlot(window, slot);
  const source = sourceAtSlot(slot);
  const reviewerIds = [context.analystId, context.seniorAnalystId, context.teamLeadId];
  const currentAppeals = new Set([3, 6, 14, 18, 32, 38]);
  const previousAppeals = new Set([3, 14]);
  const appeal = window === "current" ? currentAppeals.has(slot) : previousAppeals.has(slot);
  const reanswer = window === "current" && demoReanswerSlots.includes(slot);
  const acknowledged = window === "current" && [1, 9, 17, 24].includes(slot);
  const pending = window === "current" && [2, 5, 10, 20].includes(slot);
  const samplingTypes = ["RANDOM", "DSAT", "NEW_HIRE", "LOW_SCORE", "MANUAL", "LEAD_SIGNAL"];
  const conversationId = `demo-conversation-${code}`;
  const reviewId = `demo-review-${code}`;
  const agentMessageId = `demo-message-${code}-agent`;
  const subject = fixture?.subject ?? subjects[slot - 1];
  const highPlus = riskLevel === "HIGH" || riskLevel === "CRITICAL";

  return {
    window,
    slot,
    conversationId,
    reviewId,
    findingId: `demo-finding-${code}`,
    coachingActionId: highPlus ? `demo-coaching-${code}` : null,
    coachingDueAt: highPlus
      ? new Date(finalizedAt.getTime() + 3 * dayMs)
      : null,
    operatorId: operator.id,
    teamSlug: operator.teamSlug,
    externalSource: source,
    externalId: fixture?.externalId ?? `demo-ticket-${code}`,
    channel: fixture?.channel ?? channelForSource(source),
    subject,
    tags: fixture?.tags ?? `demo,${source},${riskLevel.toLowerCase()}`,
    customerName: fixture?.customerName ?? customerNames[(slot - 1) % customerNames.length],
    assigneeName: operator.name,
    reviewerId: reviewerIds[(slot - 1) % reviewerIds.length],
    reviewDueAt: new Date(finalizedAt.getTime() + 2 * dayMs),
    samplingReason: riskLevel === "LOW" ? "Плановая случайная выборка" : "Сценарная выборка по риску",
    samplingType: samplingTypes[(slot - 1) % samplingTypes.length],
    csatScore: riskLevel === "LOW" ? 5 : riskLevel === "MEDIUM" ? 4 : 2,
    csatBucket: riskLevel === "LOW" || riskLevel === "MEDIUM" ? "POSITIVE" : "NEGATIVE",
    supportLine: operator.supportLine,
    teamName: fixture?.teamName ?? operator.teamName,
    riskHint: fixture?.riskHint ?? (riskLevel === "LOW" ? null : "Демо-сигнал для разбора качества"),
    sentiment: null,
    openedAt: new Date(finalizedAt.getTime() - 120 * 60 * 1000),
    closedAt: new Date(finalizedAt.getTime() - 30 * 60 * 1000),
    customerMessage:
      fixture?.customerMessage ??
      `Нужна помощь: ${subject.toLocaleLowerCase("ru-RU")}. Подскажите статус и следующий шаг.`,
    agentMessage:
      fixture?.agentMessage ??
      (riskLevel === "LOW"
        ? "Оператор проверил контекст, назвал владельца и обозначил точный срок следующего шага."
        : "Оператор дал неполный ответ: не закрепил владельца и точный срок следующего шага."),
    customerMessageId: `demo-message-${code}-customer`,
    agentMessageId,
    totalScore: effectiveTotalScore,
    summary:
      fixture?.summary ??
      (riskLevel === "LOW"
        ? "Ответ закрывает вопрос клиента и фиксирует проверяемый следующий шаг."
        : "Требуется разбор полноты решения, маршрутизации и владения следующим шагом."),
    category: fixture?.category ?? categories[(slot - 1) % categories.length],
    riskLevel,
    ownerType: source === "freshdesk" || source === "otrs_family" ? "PROCESS" : "AGENT",
    finalizedAt,
    criticalError: riskLevel === "CRITICAL",
    criticalCategory:
      fixture?.criticalCategory ??
      (riskLevel === "CRITICAL" ? "Критический риск процесса" : undefined),
    needsReanswer: reanswer,
    reanswerStatus: reanswer ? "requested" : "not_needed",
    feedbackStatus: acknowledged
      ? "acknowledged"
      : pending
        ? "feedback_sent"
        : appeal
          ? "appeal"
          : slot % 5 === 0
            ? "corrected"
            : "new",
    feedbackAckAt: acknowledged ? new Date(finalizedAt.getTime() + 15 * 60 * 1000) : null,
    appealStatus: fixture?.appealStatus ?? (appeal ? "open" : "none"),
    positiveNotes: "Зафиксирован конкретный фрагмент ответа для обучения.",
    criterionValues: criterionValues(window, slot, effectiveTotalScore, agentMessageId)
  };
}

const evidence = {
  "freshdesk-processes": ["c01", "c02", "c03", "c04", "c05"],
  "zendesk-improvement": ["c09", "c10", "c11", "c12", "c13"],
  "declining-team": ["c03", "c06", "c14", "c18", "c24"],
  "ai-drift": ["c25", "c28", "c31", "c37", "c38"],
  "high-plus": ["c03", "c06", "c18", "c21", "c32"]
} satisfies Record<DemoEvidenceFactor, string[]>;

const aiPlan = [
  ["c25", -21, "yandexgpt-qc-v2", 0.88],
  ["c26", -20, "yandexgpt-qc-v2", 0.86],
  ["c27", -19, "yandexgpt-qc-v2", 0.87],
  ["c28", -14, "yandexgpt-qc-v2", 0.86],
  ["c29", -13, "yandexgpt-qc-v2", 0.85],
  ["c30", -12, "yandexgpt-qc-v2", 0.87],
  ["c31", -7, "yandexgpt-qc-v2", 0.64],
  ["c32", -6, "deterministic-v1", 0.62],
  ["c33", -5, "deterministic-v1", 0.63],
  ["c37", -1, "yandexgpt-qc-v2", 0.66],
  ["c38", 0, "deterministic-v1", 0.65],
  ["c39", 0, "deterministic-v1", 0.64]
] as const;

export const demoEvidenceReviewIds = [...new Set(Object.values(evidence).flat())]
  .sort()
  .map((code) => `demo-review-${code}`);

export const demoAnalyticalExpectations = {
  reviewCount: demoWindowSlotCount * 2,
  windowReviewCount: demoWindowSlotCount,
  criterionCount: demoCriteria.length,
  criterionBlockCount: new Set(demoCriteria.map((criterion) => criterion.blockKey)).size,
  criterionScoreCount: demoWindowSlotCount * 2 * demoCriteria.length,
  aiDraftCount: aiPlan.length,
  savedReportViewCount: 4,
  operatorCount: operators.length,
  teamCount: new Set(operators.map((operator) => operator.teamSlug)).size,
  sourceCount: sourcePlan.length,
  evidenceReviewCount: demoEvidenceReviewIds.length
} as const;

function buildAiDrafts(
  reviews: readonly ReviewedConversationSeed[],
  calendar: DemoCalendar
): DemoAiDraftSeed[] {
  const byCode = new Map(
    reviews.map((review) => [
      `c${String(review.slot).padStart(2, "0")}`,
      review
    ])
  );

  return aiPlan.map(([code, dayOffset, modelVersion, confidence], index) => {
    const review = byCode.get(code);
    if (!review) throw new Error(`Missing review for AI draft ${code}`);
    let createdAt = daysFrom(calendar, dayOffset, {
      hour: index === 10 ? 10 : index === 11 ? 11 : 10,
      minute: index === 10 ? 45 : index === 11 ? 15 : 0
    });
    if (createdAt > calendar.now) {
      createdAt = new Date(createdAt.getTime() - dayMs);
    }

    return {
      id: `demo-ai-score-${String(index + 1).padStart(2, "0")}`,
      reviewId: review.reviewId,
      conversationId: review.conversationId,
      evidenceMessageId: review.agentMessageId,
      createdAt,
      modelVersion,
      promptVersion: "quality-score-v1",
      confidence,
      criteria: review.criterionValues.map((criterion, criterionIndex) => ({
        criterionId: criterion.criterionId,
        criterionKey: criterion.criterionKey,
        value:
          criterionIndex % 3 === index % 3
            ? Math.max(1, criterion.value - 1)
            : criterion.value,
        confidence: Math.max(0.5, confidence - criterionIndex * 0.005),
        rationale:
          criterionIndex % 3 === index % 3
            ? "Модель отмечает возможное расхождение и сохраняет ссылку на доказательство."
            : "Модель подтверждает оценку по конкретному фрагменту ответа.",
        evidenceRef: review.agentMessageId
      }))
    };
  });
}

function moscowDateInput(value: Date) {
  return new Date(value.getTime() + 3 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function buildDemoSavedReportViews(calendar: DemoCalendar): DemoSavedReportViewSeed[] {
  const common = {
    period: "custom",
    start: moscowDateInput(calendar.rollingThirtyFiveDaysStart),
    end: moscowDateInput(calendar.now),
    compare: "previous" as const,
    grain: "week" as const,
    chartView: "graph" as const,
    series: ["score", "volume", "previous", "target"] as Array<
      "score" | "volume" | "previous" | "target"
    >
  };
  const create = (
    id: string,
    name: string,
    order: number,
    state: Parameters<typeof serializeReportAnalysisState>[0]
  ): DemoSavedReportViewSeed => ({
    id,
    name,
    href: serializeReportAnalysisState(state),
    scope: "shared",
    order
  });

  return [
    create("demo-saved-report-high-plus", "HIGH+ риск", 1, {
      ...common,
      view: "process",
      risk: "high_plus",
      section: "risk"
    }),
    create(
      "demo-saved-report-freshdesk-processes",
      "Freshdesk / Процессы",
      2,
      {
        ...common,
        view: "performance",
        source: "freshdesk",
        block: buildReportCatalogSlug("Процессы"),
        section: "drivers"
      }
    ),
    create(
      "demo-saved-report-declining-team",
      "Команда с просадкой",
      3,
      {
        ...common,
        view: "performance",
        team: buildReportCatalogSlug("Процессные эскалации"),
        section: "drivers"
      }
    ),
    create("demo-saved-report-ai-drift", "AI drift", 4, {
      ...common,
      view: "performance",
      section: "ai-drift"
    })
  ];
}

export function buildDemoAnalyticalScenario(
  context: DemoReviewSeedContext,
  calendar: DemoCalendar
): DemoAnalyticalScenario {
  const reviews = (["previous", "current"] as const).flatMap((window) =>
    Array.from({ length: demoWindowSlotCount }, (_, index) =>
      buildReview(context, calendar, window, index + 1)
    )
  );

  return {
    reviews,
    criteria: [...demoCriteria],
    aiDrafts: buildAiDrafts(reviews, calendar),
    quotas: [
      {
        id: "demo-quota-operator-01-current",
        operatorId: "demo-operator-01",
        assigneeName: operators[0].name,
        supportLine: operators[0].supportLine,
        plannedCount: 10
      },
      {
        id: "demo-quota-operator-02-current",
        operatorId: "demo-operator-02",
        assigneeName: operators[1].name,
        supportLine: operators[1].supportLine,
        plannedCount: 14
      }
    ],
    evidence: Object.fromEntries(
      Object.entries(evidence).map(([factor, codes]) => [
        factor,
        codes.map((code) => `demo-review-${code}`)
      ])
    ) as Record<DemoEvidenceFactor, string[]>,
    savedViews: buildDemoSavedReportViews(calendar),
    aiStory: {
      confidenceDrops: 1,
      fallbackSpikes: 1,
      weekly: [
        { confidence: 0.87, fallbackShare: 0 },
        { confidence: 0.86, fallbackShare: 0 },
        { confidence: 0.63, fallbackShare: 0.667 },
        { confidence: 0.65, fallbackShare: 0.667 }
      ]
    }
  };
}

export function buildTwoMonthReviewedConversationSeeds(
  context: DemoReviewSeedContext,
  calendar: DemoCalendar
): ReviewedConversationSeed[] {
  return buildDemoAnalyticalScenario(context, calendar).reviews;
}
