import type { BackendJobStatus } from "@prisma/client";

type StatusView = {
  label: string;
  pillClass: string;
  badgeClass: string;
  tone: "ok" | "warn" | "error" | "neutral";
};

const toneClasses: Record<StatusView["tone"], Pick<StatusView, "pillClass" | "badgeClass">> = {
  ok: {
    pillClass: "pill--ok",
    badgeClass: "border-[#bbf7d0] bg-[#ecfdf5] text-[#15803d]"
  },
  warn: {
    pillClass: "pill--neutral",
    badgeClass: "border-[#fed7aa] bg-[#fff7ed] text-[#b45309]"
  },
  error: {
    pillClass: "pill--warn",
    badgeClass: "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]"
  },
  neutral: {
    pillClass: "pill--neutral",
    badgeClass: "border-[#d9e0ea] bg-[#f8fafc] text-[#334155]"
  }
};

function view(label: string, tone: StatusView["tone"]): StatusView {
  return {
    label,
    tone,
    ...toneClasses[tone]
  };
}

export function backendJobStatusView(status: BackendJobStatus | string): StatusView {
  const views: Record<BackendJobStatus, StatusView> = {
    QUEUED: view("В очереди", "warn"),
    RUNNING: view("Выполняется", "warn"),
    SUCCEEDED: view("Готово", "ok"),
    FAILED: view("Ошибка", "error"),
    CANCELLED: view("Отменено", "neutral")
  };

  return views[status as BackendJobStatus] ?? view(status, "neutral");
}

export function integrationRunStatusView(status: string): StatusView {
  const views: Record<string, StatusView> = {
    queued: view("В очереди", "warn"),
    dry_run_queued: view("Проверка в очереди", "warn"),
    retry_scheduled: view("Повтор запланирован", "warn"),
    succeeded: view("Импорт готов", "ok"),
    imported: view("Импортировано", "ok"),
    dry_run_ok: view("Проверка готова", "ok"),
    failed: view("Ошибка", "error"),
    error: view("Ошибка", "error")
  };

  return views[status] ?? view(status, "neutral");
}

export function backendJobTypeLabel(type: string) {
  const labels: Record<string, string> = {
    DIRECTORY_SYNC: "Синхронизация каталога",
    INTEGRATION_IMPORT: "Импорт обращений",
    REPORT_EXPORT: "Экспорт отчета",
    RETENTION_CLEANUP: "Очистка данных",
    WEBHOOK_INGEST: "Прием вебхука"
  };

  return labels[type] ?? type;
}

export function queueNameLabel(queueName: string) {
  const labels: Record<string, string> = {
    default: "Общая очередь",
    directory: "Каталог пользователей",
    integrations: "Интеграции",
    maintenance: "Обслуживание",
    reports: "Отчеты"
  };

  return labels[queueName] ?? queueName;
}
