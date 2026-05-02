import type {
  ConversationChannel,
  CriterionKind,
  FindingOwnerType,
  ParticipantType,
  ReviewStatus,
  RiskLevel
} from "@prisma/client";

export const channelLabels: Record<ConversationChannel, string> = {
  CHAT: "Чат",
  EMAIL: "Email",
  TICKET: "Тикет",
  MESSENGER: "Мессенджер"
};

export const participantLabels: Record<ParticipantType, string> = {
  CUSTOMER: "Клиент",
  HUMAN_AGENT: "Оператор",
  AI_AGENT: "AI",
  SYSTEM: "Система"
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  DRAFT: "Черновик",
  FINALIZED: "Завершена"
};

export const criterionKindLabels: Record<CriterionKind, string> = {
  SCALE_1_3: "Шкала 1-3",
  PASS_FAIL: "Зачет/незачет"
};

export const ownerTypeLabels: Record<FindingOwnerType, string> = {
  AGENT: "Оператор",
  PROCESS: "Процесс",
  PRODUCT: "Продукт",
  POLICY: "Политика",
  AI_SYSTEM: "AI-система"
};

export const riskLevelLabels: Record<RiskLevel, string> = {
  LOW: "Низкий",
  MEDIUM: "Средний",
  HIGH: "Высокий",
  CRITICAL: "Критический"
};

export function formatMessageCount(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} сообщений`;
  }

  if (last === 1) {
    return `${count} сообщение`;
  }

  if (last >= 2 && last <= 4) {
    return `${count} сообщения`;
  }

  return `${count} сообщений`;
}

export function integrationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    planned: "Запланировано",
    active: "Активна",
    paused: "На паузе",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

export function conversationStatusLabel(status: string) {
  const labels: Record<string, string> = {
    open: "Открыт",
    pending: "Ожидает",
    solved: "Решен",
    closed: "Закрыт"
  };

  return labels[status] ?? status;
}
