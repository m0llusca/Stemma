import { russianPlural } from "@/lib/reports/report-format";

const integrationModeLabels: Record<string, string> = {
  diagnostics: "Диагностика",
  dry_run: "Проверка без импорта",
  fixture_import: "Импорт тестовых данных",
  import: "Импорт",
  manual: "Ручной запуск",
  manual_ticket_ids: "Ручные TicketID",
  preview: "Предпросмотр",
  scheduled: "По расписанию",
  selected_import: "Выборочный импорт",
  ticket_search: "Поиск тикетов"
};

export function integrationModeLabel(value: string) {
  return integrationModeLabels[value] ?? value;
}

const integrationRunItemStatusLabels: Record<string, string> = {
  failed: "Ошибка",
  imported: "Импортировано",
  previewed: "Предпросмотр",
  queued: "В очереди"
};

export function integrationRunItemStatusLabel(value: string) {
  return integrationRunItemStatusLabels[value] ?? value;
}

export function formatArticleCount(count: number) {
  return russianPlural(count, ["статья", "статьи", "статей"]);
}

export function formatAttachmentCount(count: number) {
  return russianPlural(count, ["файл", "файла", "файлов"]);
}
