import type { MessageTemplate, OperationalMessagingEvent } from "@/lib/messaging/types";

export function messageForOperationalEvent(event: OperationalMessagingEvent): MessageTemplate {
  if (event.type === "source_certification_lost") {
    return {
      title: "Источник потерял live certification",
      body: `${event.source} требует проверки в ${event.workspaceName}. Откройте источник и посмотрите evidence.`,
      actionLabel: "Открыть источник",
      href: event.href
    };
  }

  if (event.type === "training_overdue") {
    return {
      title: "Просрочено обучение",
      body: `${event.assigneeName}: просрочено ${event.count} назначений обучения.`,
      actionLabel: "Открыть обучение",
      href: event.href
    };
  }

  if (event.type === "queue_without_start") {
    return {
      title: "Очередь без старта",
      body: `${event.count} проверок ждут старта. Назначьте или откройте следующую проверку.`,
      actionLabel: "Открыть очередь",
      href: event.href
    };
  }

  return {
    title: "Рост риска",
    body: `${event.riskCount} сигналов риска требуют разбора.`,
    actionLabel: "Открыть риски",
    href: event.href
  };
}
