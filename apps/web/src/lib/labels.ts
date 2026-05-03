import type {
  ConversationChannel,
  CriterionKind,
  FindingOwnerType,
  ParticipantType,
  QaStatus,
  RoleName,
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
  AI_AGENT: "ИИ",
  SYSTEM: "Система"
};

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  DRAFT: "Черновик",
  FINALIZED: "Завершена"
};

export const qaStatusLabels: Record<QaStatus, string> = {
  QUEUED: "В очереди",
  ASSIGNED: "Назначено",
  IN_PROGRESS: "В работе",
  FINALIZED: "Завершено",
  REOPENED: "На пересмотре"
};

export const roleLabels: Record<RoleName, string> = {
  ADMIN: "Администратор",
  TEAM_LEAD: "Руководитель контроля качества",
  QA_ANALYST: "Проверяющий",
  SUPPORT_AGENT: "Оператор",
  VIEWER: "Наблюдатель"
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
  AI_SYSTEM: "ИИ-система"
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
    ready: "Готова к подключению",
    active: "Активна",
    queued: "В очереди",
    paused: "На паузе",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

export function externalSourceLabel(source: string) {
  const labels: Record<string, string> = {
    custom_api: "Свой API",
    demo_import: "Демо-импорт",
    freshdesk: "Freshdesk",
    hubspot: "HubSpot Service Hub",
    intercom: "Intercom",
    native_helpdesk: "Helpdesk API",
    otrs: "OTRS",
    otrs6: "OTRS 6 Community Edition",
    otrs_family: "OTRS/Znuny",
    znuny: "Znuny",
    zendesk: "Zendesk"
  };

  return labels[source] ?? source;
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

export const reviewQueueStatusLabels = {
  all: "Все",
  unreviewed: "В очереди",
  reviewed: "Завершена"
} as const;

export const samplingTypeLabels: Record<string, string> = {
  RANDOM: "Случайная выборка",
  DSAT: "Негативный CSAT",
  LEAD_SIGNAL: "Сигнал руководителя",
  NEW_HIRE: "Новичок",
  LOW_SCORE: "Низкая оценка",
  MANUAL: "Ручное добавление"
};

export const csatBucketLabels: Record<string, string> = {
  NEGATIVE: "CSAT 1-2",
  POSITIVE: "CSAT 3-5",
  NO_SCORE: "Без CSAT"
};

export const feedbackStatusLabels: Record<string, string> = {
  new: "Новая",
  feedback_sent: "Обратная связь отправлена",
  acknowledged: "Ознакомлен",
  appeal: "Апелляция",
  corrected: "Скорректирована"
};

export const appealStatusLabels: Record<string, string> = {
  none: "Нет",
  open: "Открыта",
  confirmed: "Оценка подтверждена",
  corrected: "Оценка скорректирована",
  calibration: "На калибровку"
};

export const reanswerStatusLabels: Record<string, string> = {
  not_needed: "Не нужен",
  required: "Нужен переответ",
  requested: "Передан руководителю",
  completed: "Переответ выполнен"
};
