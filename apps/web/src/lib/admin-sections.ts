/**
 * Канонический словарь имён разделов настроек: ОДНО имя на роут для всех
 * поверхностей — верхнее меню (navigation.ts), левый рейл (admin-subnav),
 * карточки обзора /admin, заголовок PageShell и скелетоны загрузки.
 * Любая новая поверхность обязана брать имя отсюда, а не хардкодить своё.
 */
export const adminSectionTitles = {
  "/admin": "Обзор настроек",
  "/admin/scorecards": "Формы оценки",
  "/admin/sampling": "Правила выборки",
  "/admin/ai-scoring": "AI-оценка",
  "/admin/integrations": "Интеграции",
  "/admin/access": "Доступ и SSO",
  "/admin/channels": "Каналы уведомлений",
  "/admin/users": "Пользователи и роли",
  "/admin/system": "Состояние системы",
  "/admin/tokens": "API-доступ",
  "/admin/appearance": "Внешний вид",
  "/admin/localization": "Локализация",
  "/admin/audit": "Журнал действий",
  "/admin/report-schedules": "Расписания отчетов"
} as const;

export type AdminSectionHref = keyof typeof adminSectionTitles;

/** Родовое имя области настроек — единый eyebrow всех admin-страниц. */
export const adminEyebrow = "Настройки";

/** Единый шаблон подписи скелетона загрузки раздела. */
export function adminLoadingLabel(href: AdminSectionHref) {
  return `Загрузка: ${adminSectionTitles[href]}`;
}
