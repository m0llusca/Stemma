import type { ConversationChannel, FindingOwnerType, RiskLevel } from "@prisma/client";

export type ReviewedConversationSeed = {
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

export type DemoReviewSeedContext = {
  analystId: string;
  teamLeadId: string;
  seniorAnalystId: string;
  supportAgentName: string;
  supportOlgaName: string;
  supportDenisName: string;
  supportElenaName: string;
};

type DemoReviewSlot = {
  externalId: string;
  finalizedAt: string;
  totalScore: number;
  source?: string;
  channel?: ConversationChannel;
  samplingType?: string;
  feedbackStatus?: string;
  appealStatus?: string;
  reanswerStatus?: string;
  needsReanswer?: boolean;
  criticalError?: boolean;
};

type DemoScenario = {
  subject: string;
  tags: string;
  category: string;
  ownerType?: FindingOwnerType;
  customerMessage: string;
  customerFollowUp?: string;
  strongAgentMessage: string;
  weakAgentMessage: string;
  strongSummary: string;
  weakSummary: string;
  positiveNotes: string;
  riskHint?: string;
};

const dayMs = 24 * 60 * 60 * 1000;

const customerNames = [
  "Наталья Белова",
  "Аркадий Лебедев",
  "Полина Сафонова",
  "Марина Котова",
  "Роман Ильин",
  "Егор Селезнев",
  "Илья Макаров",
  "Вера Громова",
  "Кирилл Астахов",
  "Оксана Миронова",
  "Лев Панин",
  "Светлана Мельникова",
  "Алина Романова",
  "Петр Жуков",
  "Юлия Нестерова",
  "Галина Фролова",
  "Михаил Серов",
  "Денис Яковлев",
  "Екатерина Лапина",
  "Семен Власов"
];

const scenarios: DemoScenario[] = [
  {
    subject: "Уточнение статуса заявления",
    tags: "статус,заявление,фгис",
    category: "Полнота решения",
    customerMessage: "Не вижу статус заявления в личном кабинете и не понимаю, что делать дальше.",
    strongAgentMessage: "Статус находится в разделе «Заявления». Сейчас он на проверке, обновление появится до конца рабочего дня.",
    weakAgentMessage: "Проверьте статус в личном кабинете позже.",
    strongSummary: "Оператор дал точный путь, статус и следующий шаг с понятным сроком.",
    weakSummary: "Ответ слишком общий: нет точного раздела, срока и действия при просрочке.",
    positiveNotes: "Хорошо закрыто ожидание клиента по следующему шагу."
  },
  {
    subject: "Сбой авторизации после смены пароля",
    tags: "авторизация,код,технический-сбой",
    category: "Ожидания клиента",
    customerMessage: "После смены пароля не приходит код, а оплатить счет нужно сегодня.",
    customerFollowUp: "Если код не придет, нужен запасной способ входа.",
    strongAgentMessage: "Я проверил отправку кода: повторная отправка доступна через 10 минут, запасной вход через email включен.",
    weakAgentMessage: "Попробуйте запросить код позже.",
    strongSummary: "Даны срок, причина ожидания и запасной канал входа.",
    weakSummary: "Не объяснен срок доставки кода и не предложен запасной сценарий.",
    positiveNotes: "Оператор не оставил клиента без способа продолжить работу."
  },
  {
    subject: "Промокод не применился к заказу",
    tags: "промокод,оплата,компенсация",
    category: "Проверка условий",
    ownerType: "POLICY",
    customerMessage: "Промокод активен, но сумма заказа не изменилась.",
    strongAgentMessage: "Промокод действует только на новые услуги. По вашему заказу я добавил корректную скидку вручную.",
    weakAgentMessage: "Промокод может не работать из-за условий акции.",
    strongSummary: "Оператор сверил условия акции и дал конкретное решение по заказу.",
    weakSummary: "Не проверены условия акции и не дан результат по конкретному заказу.",
    positiveNotes: "Хорошая привязка политики акции к обращению клиента."
  },
  {
    subject: "Перенос записи на услугу",
    tags: "запись,перенос,new_hire",
    category: "Работа в обращении",
    customerMessage: "Нужно перенести запись на следующую неделю и получить подтверждение.",
    strongAgentMessage: "Запись перенесена на вторник 10:30, уведомление отправлено на email и в личный кабинет.",
    weakAgentMessage: "Я перенес запись, проверьте личный кабинет.",
    strongSummary: "Подтверждены дата, канал уведомления и итог переноса.",
    weakSummary: "Не подтверждены все каналы уведомления и точное время записи.",
    positiveNotes: "Корректное закрытие операционного запроса без лишней переписки."
  },
  {
    subject: "Закрывающие документы не пришли",
    tags: "документы,бухгалтерия,срок",
    category: "Полнота решения",
    customerMessage: "Закрывающие документы не пришли, бухгалтерия ждет сегодня.",
    customerFollowUp: "Без документов платеж не проведут.",
    strongAgentMessage: "Документы сформированы и уйдут до 16:00. Я добавил контрольную задачу и пришлю подтверждение.",
    weakAgentMessage: "Документы обычно приходят в течение нескольких дней.",
    strongSummary: "Проверен фактический статус документов и зафиксирован контрольный срок.",
    weakSummary: "Не проверен фактический статус отправки и нет конкретного срока.",
    positiveNotes: "Клиент получил проверяемое обещание вместо общего шаблона."
  },
  {
    subject: "Неверная маршрутизация технической ошибки",
    tags: "маршрутизация,sla,critical",
    category: "Неверная маршрутизация",
    ownerType: "PROCESS",
    customerMessage: "Ошибка не исправлена, меня переводят между отделами.",
    strongAgentMessage: "Я назначил владельца второй линии, причина передачи описана, обновление будет до 18:00.",
    weakAgentMessage: "Ваш вопрос передан в другой отдел.",
    strongSummary: "Маршрутизация прозрачна: владелец, причина и срок обновления указаны.",
    weakSummary: "Клиент не получил владельца, причину передачи и срок следующего обновления.",
    positiveNotes: "Тон корректный, но процесс требует контроля владельца.",
    riskHint: "Потеря SLA из-за передачи без владельца"
  },
  {
    subject: "Уточнение тарифа после продления",
    tags: "тариф,продление,условия",
    category: "Корректность шаблона",
    ownerType: "POLICY",
    customerMessage: "Почему тариф стал дороже после продления?",
    strongAgentMessage: "Цена изменилась из-за окончания промо-периода. Вот ссылка на условия и расчет по вашему тарифу.",
    weakAgentMessage: "Стоимость зависит от условий тарифа.",
    strongSummary: "Объяснена причина изменения цены и приложено основание.",
    weakSummary: "Ответ понятный по тону, но нет ссылки на актуальные условия.",
    positiveNotes: "Хорошая связка между политикой тарифа и конкретным расчетом."
  },
  {
    subject: "Долгое ожидание ответа в мессенджере",
    tags: "скорость,ожидание,dsat",
    category: "Стиль и ясность",
    customerMessage: "Я жду ответа уже несколько часов.",
    strongAgentMessage: "Извините за ожидание. Проверка заняла больше времени из-за сверки платежа, сейчас статус обновлен.",
    weakAgentMessage: "Ваш вопрос решен, проверьте статус.",
    strongSummary: "Оператор признал задержку, объяснил причину и закрыл следующий шаг.",
    weakSummary: "Не признана задержка и не объяснена причина ожидания.",
    positiveNotes: "Тон спокойный и не перекладывает ответственность на клиента."
  },
  {
    subject: "Некорректная ссылка в инструкции",
    tags: "инструкция,ссылка,шаблон",
    category: "Корректность шаблона",
    customerMessage: "Ссылка из ответа ведет на старую инструкцию.",
    strongAgentMessage: "Спасибо, ссылка обновлена. Вот актуальная инструкция и короткий путь к нужному разделу.",
    weakAgentMessage: "Используйте другую инструкцию из базы знаний.",
    strongSummary: "Ссылка исправлена, клиент получил актуальную инструкцию и путь.",
    weakSummary: "Первичный ответ был без проверки актуальности инструкции.",
    positiveNotes: "Быстрое исправление без оборонительной формулировки."
  },
  {
    subject: "Сложный запрос по договору",
    tags: "договор,сложный-запрос,best-practice",
    category: "Сложный кейс",
    customerMessage: "Нужно согласовать несколько изменений в договоре одним письмом.",
    customerFollowUp: "Важно не потерять ни одну правку.",
    strongAgentMessage: "Я собрал все правки в один список, отметил владельцев и срок финального согласования.",
    weakAgentMessage: "Передал ваши правки ответственным коллегам.",
    strongSummary: "Сложный кейс закрыт структурно: факты, владельцы и сроки собраны в одном ответе.",
    weakSummary: "Не собран единый итог по правкам, клиенту придется уточнять повторно.",
    positiveNotes: "Можно использовать как эталон для обучения команды."
  },
  {
    subject: "Шаблонный ответ без персонализации",
    tags: "шаблон,персонализация,manual",
    category: "Персонализация",
    customerMessage: "В ответе не указано, какие документы нужны именно для моей ситуации.",
    strongAgentMessage: "Для вашего типа заявления нужны паспорт, договор и подтверждение оплаты. Я отметил это в заявке.",
    weakAgentMessage: "Список документов указан в общей инструкции.",
    strongSummary: "Шаблон адаптирован под сценарий клиента и содержит конкретный список документов.",
    weakSummary: "Шаблон не адаптирован под тип заявления клиента.",
    positiveNotes: "Персонализация снижает риск повторного обращения."
  },
  {
    subject: "Запрос на удаление персональных данных",
    tags: "персональные-данные,политика,lead_signal",
    category: "Политика данных",
    ownerType: "POLICY",
    customerMessage: "Хочу удалить старые персональные данные из профиля.",
    strongAgentMessage: "Я проверил право на запрос, описал процедуру удаления и срок обработки до 5 рабочих дней.",
    weakAgentMessage: "Удаление данных выполняется по регламенту.",
    strongSummary: "Чувствительный запрос обработан корректно: право, процедура и срок описаны.",
    weakSummary: "Не хватает процедуры, срока и подтверждения права клиента на запрос.",
    positiveNotes: "Аккуратная работа с чувствительным запросом."
  }
];

const earlyAprilSlots: DemoReviewSlot[] = [
  { externalId: "OTRS-2301", finalizedAt: "2026-04-02T10:20:00.000Z", totalScore: 93 },
  { externalId: "ZD-6801", finalizedAt: "2026-04-04T12:15:00.000Z", totalScore: 81, samplingType: "DSAT" },
  { externalId: "INT-4801", finalizedAt: "2026-04-06T15:40:00.000Z", totalScore: 72, feedbackStatus: "feedback_sent" },
  { externalId: "FD-3001", finalizedAt: "2026-04-08T09:35:00.000Z", totalScore: 88, samplingType: "NEW_HIRE" },
  { externalId: "HS-4001", finalizedAt: "2026-04-10T13:25:00.000Z", totalScore: 64, samplingType: "DSAT" },
  { externalId: "conv-1801", finalizedAt: "2026-04-12T16:10:00.000Z", totalScore: 96 },
  { externalId: "OTRS-2302", finalizedAt: "2026-04-15T11:45:00.000Z", totalScore: 48, criticalError: true },
  { externalId: "ZD-6802", finalizedAt: "2026-04-17T14:00:00.000Z", totalScore: 84 },
  { externalId: "API-6001", finalizedAt: "2026-04-19T10:30:00.000Z", totalScore: 78, source: "custom_api" },
  { externalId: "FD-3002", finalizedAt: "2026-04-21T12:50:00.000Z", totalScore: 90 }
];

const previousPeriodSlots: DemoReviewSlot[] = [
  { externalId: "ZD-6901", finalizedAt: "2026-04-22T10:00:00.000Z", totalScore: 90, feedbackStatus: "acknowledged" },
  { externalId: "OTRS-2501", finalizedAt: "2026-04-23T11:20:00.000Z", totalScore: 83 },
  { externalId: "INT-5001", finalizedAt: "2026-04-24T15:10:00.000Z", totalScore: 77 },
  { externalId: "FD-3101", finalizedAt: "2026-04-25T12:35:00.000Z", totalScore: 71, needsReanswer: true, reanswerStatus: "completed", feedbackStatus: "corrected", appealStatus: "corrected" },
  { externalId: "HS-4201", finalizedAt: "2026-04-26T13:45:00.000Z", totalScore: 65, needsReanswer: true, reanswerStatus: "required", feedbackStatus: "acknowledged", appealStatus: "confirmed" },
  { externalId: "conv-2001", finalizedAt: "2026-04-27T16:20:00.000Z", totalScore: 58, feedbackStatus: "feedback_sent" },
  { externalId: "ZD-6902", finalizedAt: "2026-04-28T12:00:00.000Z", totalScore: 44, needsReanswer: true, reanswerStatus: "requested", feedbackStatus: "appeal", appealStatus: "open" },
  { externalId: "OTRS-2502", finalizedAt: "2026-04-29T11:30:00.000Z", totalScore: 87, feedbackStatus: "acknowledged" },
  { externalId: "INT-5002", finalizedAt: "2026-04-30T10:15:00.000Z", totalScore: 92 },
  { externalId: "FD-3102", finalizedAt: "2026-05-01T14:40:00.000Z", totalScore: 79, samplingType: "LOW_SCORE" },
  { externalId: "HS-4202", finalizedAt: "2026-05-02T09:25:00.000Z", totalScore: 55, samplingType: "DSAT", needsReanswer: true, reanswerStatus: "required" },
  { externalId: "conv-2002", finalizedAt: "2026-05-03T12:05:00.000Z", totalScore: 98, feedbackStatus: "acknowledged" },
  { externalId: "OTRS-2503", finalizedAt: "2026-05-04T13:50:00.000Z", totalScore: 86 },
  { externalId: "ZD-6903", finalizedAt: "2026-05-05T09:45:00.000Z", totalScore: 73, feedbackStatus: "appeal", appealStatus: "calibration" },
  { externalId: "API-6002", finalizedAt: "2026-05-06T16:30:00.000Z", totalScore: 82, source: "custom_api", samplingType: "MANUAL" },
  { externalId: "FD-3103", finalizedAt: "2026-05-07T11:05:00.000Z", totalScore: 67, needsReanswer: true, reanswerStatus: "requested" },
  { externalId: "INT-5003", finalizedAt: "2026-05-08T10:10:00.000Z", totalScore: 91 },
  { externalId: "HS-4203", finalizedAt: "2026-05-09T15:55:00.000Z", totalScore: 76, samplingType: "LEAD_SIGNAL" },
  { externalId: "conv-2003", finalizedAt: "2026-05-10T14:35:00.000Z", totalScore: 69, feedbackStatus: "feedback_sent" },
  { externalId: "OTRS-2504", finalizedAt: "2026-05-11T09:50:00.000Z", totalScore: 94, feedbackStatus: "acknowledged" },
  { externalId: "ZD-6904", finalizedAt: "2026-05-12T13:15:00.000Z", totalScore: 61, samplingType: "DSAT", needsReanswer: true, reanswerStatus: "required" },
  { externalId: "INT-5004", finalizedAt: "2026-05-13T11:25:00.000Z", totalScore: 89 },
  { externalId: "FD-3104", finalizedAt: "2026-05-14T10:45:00.000Z", totalScore: 74, feedbackStatus: "appeal", appealStatus: "open" },
  { externalId: "HS-4204", finalizedAt: "2026-05-15T16:05:00.000Z", totalScore: 85, samplingType: "MANUAL" },
  { externalId: "API-6003", finalizedAt: "2026-05-16T12:20:00.000Z", totalScore: 52, source: "custom_api", needsReanswer: true, reanswerStatus: "requested" },
  { externalId: "conv-2004", finalizedAt: "2026-05-18T14:05:00.000Z", totalScore: 80 },
  { externalId: "OTRS-2505", finalizedAt: "2026-05-20T11:40:00.000Z", totalScore: 95, feedbackStatus: "acknowledged" },
  { externalId: "ZD-6905", finalizedAt: "2026-05-21T15:20:00.000Z", totalScore: 70, samplingType: "LOW_SCORE" }
];

const currentPeriodSlots: DemoReviewSlot[] = [
  { externalId: "OTRS-2601", finalizedAt: "2026-05-22T11:00:00.000Z", totalScore: 96, feedbackStatus: "acknowledged" },
  { externalId: "ZD-7001", finalizedAt: "2026-05-22T13:20:00.000Z", totalScore: 82, feedbackStatus: "feedback_sent" },
  { externalId: "INT-5101", finalizedAt: "2026-05-22T14:10:00.000Z", totalScore: 74, feedbackStatus: "appeal", appealStatus: "open", needsReanswer: true, reanswerStatus: "requested" },
  { externalId: "FD-3201", finalizedAt: "2026-05-23T08:45:00.000Z", totalScore: 89, samplingType: "NEW_HIRE", feedbackStatus: "acknowledged" },
  { externalId: "HS-4301", finalizedAt: "2026-05-23T10:15:00.000Z", totalScore: 68, needsReanswer: true, reanswerStatus: "required" },
  { externalId: "conv-2101", finalizedAt: "2026-05-23T15:00:00.000Z", totalScore: 93, feedbackStatus: "acknowledged" },
  { externalId: "OTRS-2602", finalizedAt: "2026-05-24T09:30:00.000Z", totalScore: 58, criticalError: true, feedbackStatus: "appeal", appealStatus: "calibration", needsReanswer: true, reanswerStatus: "requested" },
  { externalId: "ZD-7002", finalizedAt: "2026-05-24T11:45:00.000Z", totalScore: 85, samplingType: "MANUAL", feedbackStatus: "new" },
  { externalId: "INT-5102", finalizedAt: "2026-05-24T16:10:00.000Z", totalScore: 57, feedbackStatus: "corrected", appealStatus: "corrected", needsReanswer: true, reanswerStatus: "completed" },
  { externalId: "FD-3202", finalizedAt: "2026-05-25T08:20:00.000Z", totalScore: 78 },
  { externalId: "HS-4302", finalizedAt: "2026-05-25T10:35:00.000Z", totalScore: 99, feedbackStatus: "acknowledged" },
  { externalId: "conv-2102", finalizedAt: "2026-05-25T14:30:00.000Z", totalScore: 62, needsReanswer: true, reanswerStatus: "required" },
  { externalId: "ZD-7003", finalizedAt: "2026-05-26T09:20:00.000Z", totalScore: 91, samplingType: "LEAD_SIGNAL" },
  { externalId: "OTRS-2603", finalizedAt: "2026-05-26T12:05:00.000Z", totalScore: 49, feedbackStatus: "appeal", appealStatus: "open", needsReanswer: true, reanswerStatus: "requested" },
  { externalId: "API-6101", finalizedAt: "2026-05-22T16:40:00.000Z", totalScore: 87, source: "custom_api", samplingType: "RANDOM" },
  { externalId: "FD-3203", finalizedAt: "2026-05-23T12:25:00.000Z", totalScore: 66, samplingType: "DSAT", needsReanswer: true, reanswerStatus: "required" },
  { externalId: "HS-4303", finalizedAt: "2026-05-24T13:35:00.000Z", totalScore: 92 },
  { externalId: "INT-5103", finalizedAt: "2026-05-25T09:15:00.000Z", totalScore: 75, feedbackStatus: "appeal", appealStatus: "confirmed" },
  { externalId: "ZD-7004", finalizedAt: "2026-05-25T16:55:00.000Z", totalScore: 84 },
  { externalId: "OTRS-2604", finalizedAt: "2026-05-26T08:40:00.000Z", totalScore: 71, samplingType: "LOW_SCORE" },
  { externalId: "conv-2103", finalizedAt: "2026-05-26T10:50:00.000Z", totalScore: 97, feedbackStatus: "acknowledged" },
  { externalId: "API-6102", finalizedAt: "2026-05-26T15:30:00.000Z", totalScore: 60, source: "custom_api", samplingType: "MANUAL", needsReanswer: true, reanswerStatus: "requested" }
];

function sourceFromExternalId(externalId: string) {
  if (externalId.startsWith("OTRS-")) return "otrs_family";
  if (externalId.startsWith("ZD-")) return "zendesk";
  if (externalId.startsWith("INT-")) return "intercom";
  if (externalId.startsWith("FD-")) return "freshdesk";
  if (externalId.startsWith("HS-")) return "hubspot";
  if (externalId.startsWith("API-")) return "custom_api";
  return "demo_import";
}

function channelForSource(source: string): ConversationChannel {
  if (source === "intercom") return "MESSENGER";
  if (source === "zendesk" || source === "hubspot") return "EMAIL";
  if (source === "otrs_family" || source === "freshdesk") return "TICKET";
  return "CHAT";
}

function riskForScore(totalScore: number): RiskLevel {
  if (totalScore < 55) return "CRITICAL";
  if (totalScore < 75) return "HIGH";
  if (totalScore < 85) return "MEDIUM";
  return "LOW";
}

function csatForScore(totalScore: number) {
  if (totalScore >= 88) return { csatScore: 5, csatBucket: "POSITIVE" };
  if (totalScore >= 75) return { csatScore: 4, csatBucket: "POSITIVE" };
  if (totalScore >= 65) return { csatScore: 2, csatBucket: "NEGATIVE" };
  if (totalScore >= 55) return { csatScore: 1, csatBucket: "NEGATIVE" };
  return { csatScore: 1, csatBucket: "NEGATIVE" };
}

function feedbackFor(slot: DemoReviewSlot, index: number, riskLevel: RiskLevel) {
  if (slot.feedbackStatus) {
    return slot.feedbackStatus;
  }

  if (riskLevel === "CRITICAL" || (riskLevel === "HIGH" && index % 4 === 0)) {
    return "appeal";
  }

  return ["acknowledged", "feedback_sent", "new", "corrected"][index % 4];
}

function appealFor(slot: DemoReviewSlot, feedbackStatus: string, index: number) {
  if (slot.appealStatus) {
    return slot.appealStatus;
  }

  if (feedbackStatus === "appeal") {
    return ["open", "calibration", "open"][index % 3];
  }

  if (feedbackStatus === "corrected") {
    return "corrected";
  }

  return "none";
}

function buildSeed(slot: DemoReviewSlot, index: number, context: DemoReviewSeedContext): ReviewedConversationSeed {
  const source = slot.source ?? sourceFromExternalId(slot.externalId);
  const finalizedAt = new Date(slot.finalizedAt);
  const openedAt = new Date(finalizedAt.getTime() - (120 + (index % 6) * 18) * 60 * 1000);
  const closedAt = new Date(finalizedAt.getTime() - (55 + (index % 4) * 8) * 60 * 1000);
  const scenario = scenarios[index % scenarios.length];
  const operators = [
    { name: context.supportOlgaName, supportLine: "1ЛП", teamName: "ФГИС" },
    { name: context.supportDenisName, supportLine: "1ЛП", teamName: "Коммерческие сервисы" },
    { name: context.supportElenaName, supportLine: "2ЛП", teamName: "Личный кабинет" },
    { name: context.supportAgentName, supportLine: "2ЛП", teamName: "ФГИС" }
  ];
  const reviewers = [context.analystId, context.seniorAnalystId, context.teamLeadId];
  const operator = operators[index % operators.length];
  const riskLevel = riskForScore(slot.totalScore);
  const feedbackStatus = feedbackFor(slot, index, riskLevel);
  const appealStatus = appealFor(slot, feedbackStatus, index);
  const needsReanswer = slot.needsReanswer ?? ((riskLevel === "HIGH" || riskLevel === "CRITICAL") && index % 2 === 0);
  const reanswerStatus = needsReanswer ? slot.reanswerStatus ?? (index % 3 === 0 ? "requested" : "required") : "not_needed";
  const strong = slot.totalScore >= 85;
  const { csatScore, csatBucket } = slot.samplingType === "MANUAL" ? { csatScore: null, csatBucket: "NO_SCORE" } : csatForScore(slot.totalScore);

  return {
    externalSource: source,
    externalId: slot.externalId,
    channel: slot.channel ?? channelForSource(source),
    subject: scenario.subject,
    tags: `${scenario.tags},${slot.samplingType ?? "RANDOM"},${source}`,
    customerName: customerNames[index % customerNames.length],
    assigneeName: operator.name,
    reviewerId: reviewers[index % reviewers.length],
    reviewDueAt: new Date(finalizedAt.getTime() + 2 * dayMs),
    samplingReason: samplingReason(slot.samplingType, riskLevel),
    samplingType: slot.samplingType ?? (riskLevel === "LOW" ? "RANDOM" : riskLevel === "MEDIUM" ? "LOW_SCORE" : "DSAT"),
    csatScore,
    csatBucket,
    supportLine: operator.supportLine,
    teamName: operator.teamName,
    riskHint: scenario.riskHint ?? (riskLevel === "LOW" ? null : "Демо-сигнал для разбора качества"),
    openedAt,
    closedAt,
    customerMessage: scenario.customerMessage,
    customerFollowUp: scenario.customerFollowUp,
    agentMessage: strong ? scenario.strongAgentMessage : scenario.weakAgentMessage,
    totalScore: slot.totalScore,
    summary: strong ? scenario.strongSummary : scenario.weakSummary,
    category: scenario.category,
    riskLevel,
    ownerType: scenario.ownerType,
    finalizedAt,
    criticalError: slot.criticalError ?? false,
    criticalCategory: slot.criticalError ? scenario.category : undefined,
    needsReanswer,
    reanswerStatus,
    feedbackStatus,
    appealStatus,
    positiveNotes: scenario.positiveNotes
  };
}

function samplingReason(samplingType: string | undefined, riskLevel: RiskLevel) {
  if (samplingType === "MANUAL") return "Ручное добавление после разбора руководителя";
  if (samplingType === "NEW_HIRE") return "Контроль нового сотрудника";
  if (samplingType === "LEAD_SIGNAL") return "Сигнал руководителя по рисковому сценарию";
  if (samplingType === "DSAT" || riskLevel === "HIGH" || riskLevel === "CRITICAL") return "Негативный CSAT или низкая оценка";
  if (samplingType === "LOW_SCORE") return "Низкая оценка по одному из критериев";
  return "Плановая случайная выборка";
}

export function buildTwoMonthReviewedConversationSeeds(context: DemoReviewSeedContext): ReviewedConversationSeed[] {
  return [...earlyAprilSlots, ...previousPeriodSlots, ...currentPeriodSlots].map((slot, index) => buildSeed(slot, index, context));
}
