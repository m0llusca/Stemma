import type { RoleName } from "@prisma/client";
import { ArrowLeft, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import Link from "next/link";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { createLocalUser, updateUserAccess } from "@/lib/admin-user-actions";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { getPermissions, type Permission } from "@/lib/auth/permissions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";

export const dynamic = "force-dynamic";

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type UsersSection = "directory" | "create" | "roles";

const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];

const userSections: Array<{ value: UsersSection; label: string }> = [
  { value: "directory", label: "Учетные записи" },
  { value: "roles", label: "Роли и доступы" }
];

const permissionLabels: Record<Permission, string> = {
  "reviews:read": "Очередь проверок",
  "reviews:write": "Черновики оценок",
  "reviews:finalize": "Завершение проверок",
  "workflow:manage": "Процессы обращений",
  "feedback:acknowledge": "Апелляции и обратная связь",
  "self_review:write": "Самопроверка",
  "calibration:manage": "Калибровки",
  "reports:read": "Отчеты",
  "reports:manage": "Экспорт отчетов",
  "scorecards:manage": "Формы оценки",
  "sampling:manage": "Выборки",
  "integrations:manage": "Интеграции",
  "users:manage": "Пользователи и роли",
  "appearance:manage": "Внешний вид",
  "api_tokens:manage": "API-ключи",
  "audit:read": "Журнал действий",
  "training:manage": "Обучение",
  "backend_jobs:manage": "Системные задачи",
  "auth_providers:manage": "SSO и группы",
  "privacy:manage": "Приватность"
};

const permissionGroups: Array<{ title: string; description: string; permissions: Permission[] }> = [
  {
    title: "Проверки и процессы",
    description: "Работа с очередью, черновиками, финализацией и статусами обращений.",
    permissions: ["reviews:read", "reviews:write", "reviews:finalize", "workflow:manage", "feedback:acknowledge", "self_review:write"]
  },
  {
    title: "Методология QA",
    description: "Формы оценки, выборки, калибровки и обучение.",
    permissions: ["scorecards:manage", "sampling:manage", "calibration:manage", "training:manage"]
  },
  {
    title: "Аналитика",
    description: "Отчеты и чтение операционной истории.",
    permissions: ["reports:read", "reports:manage", "audit:read"]
  },
  {
    title: "Администрирование",
    description: "Интеграции, пользователи, SSO, API-доступ и системные задачи.",
    permissions: ["integrations:manage", "users:manage", "auth_providers:manage", "api_tokens:manage", "backend_jobs:manage", "appearance:manage", "privacy:manage"]
  }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function usersSectionParam(value: string | string[] | undefined, openCreateUser: boolean): UsersSection {
  if (openCreateUser) {
    return "create";
  }

  const section = firstParam(value);

  if (section === "create") {
    return "create";
  }

  return userSections.some((item) => item.value === section) ? (section as UsersSection) : "directory";
}

function usersSectionHref(section: UsersSection) {
  return `/admin/users?section=${section}`;
}

function createUserHref() {
  return "/admin/users?create=1";
}

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function loginLabel(value: string | null | undefined) {
  return value || "SSO";
}

function roleTone(role: RoleName) {
  if (role === "ADMIN") return "pill--warn";
  if (role === "VIEWER") return "pill--neutral";
  return "pill--ok";
}

function RoleSelect({ defaultValue }: { defaultValue: RoleName }) {
  return (
    <select name="role" defaultValue={defaultValue} className="form-control">
      {roles.map((role) => (
        <option key={role} value={role}>
          {roleLabels[role]}
        </option>
      ))}
    </select>
  );
}

function permissionSummary(role: RoleName, permissions: Permission[]) {
  const enabled = permissions.filter((permission) => getPermissions(role).includes(permission));

  return {
    enabled,
    label: enabled.length === permissions.length ? "Все" : enabled.length > 0 ? `${enabled.length}/${permissions.length}` : "Нет"
  };
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = await searchParams;
  const currentUser = await requireCurrentUserPermission("users:manage");
  const [users, activeSessionRows] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceId: currentUser.workspaceId },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: {
        localCredential: {
          select: {
            login: true,
            lastLoginAt: true
          }
        },
        _count: {
          select: {
            authSessions: true,
            externalIdentities: true,
            reviews: true
          }
        }
      }
    }),
    prisma.authSession.groupBy({
      by: ["userId"],
      where: {
        workspaceId: currentUser.workspaceId,
        status: "ACTIVE"
      },
      _count: {
        _all: true
      }
    })
  ]);
  const activeSessionsByUser = new Map(activeSessionRows.map((row) => [row.userId, row._count._all]));
  const activeSessions = activeSessionRows.reduce((sum, row) => sum + row._count._all, 0);
  const localUsers = users.filter((user) => user.localCredential).length;
  const ssoLinkedUsers = users.filter((user) => user._count.externalIdentities > 0).length;
  const adminUsers = users.filter((user) => user.role === "ADMIN").length;
  const roleUserCounts = roles.reduce(
    (counts, role) => ({
      ...counts,
      [role]: users.filter((user) => user.role === role).length
    }),
    {} as Record<RoleName, number>
  );
  const openCreateUser = firstParam(params.create) === "1";
  const activeSection = usersSectionParam(params.section, openCreateUser);
  const usersSetupHint = users.length > 1 ? null : getSettingCoachmark("users");

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Пользователи и роли</h1>
          <p className="page-subtitle">
            Управление учетными записями, ролями, командами, линиями поддержки и доступом без длинных скрытых блоков.
          </p>
          <div className="admin-actions mt-5">
            <Link href={createUserHref()} className="action-button action-button--primary">
              <UserCog size={16} aria-hidden="true" />
              Создать пользователя
            </Link>
            <Link href="/admin/access" className="action-button">
              <ShieldCheck size={16} aria-hidden="true" />
              SSO и сессии
            </Link>
          </div>
        </div>
      </div>

      <section className="ops-metric-grid" aria-label="Сводка пользователей">
        <div className="ops-metric">
          <span className="ops-metric__label">Пользователи</span>
          <strong className="ops-metric__value">{users.length}</strong>
          <span className="ops-metric__note">Администраторов: {adminUsers}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Локальный вход</span>
          <strong className="ops-metric__value">{localUsers}</strong>
          <span className="ops-metric__note">SSO-связи: {ssoLinkedUsers}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Активные сессии</span>
          <strong className="ops-metric__value">{activeSessions}</strong>
          <span className="ops-metric__note">Последние входы видны по пользователям</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Ролевой контроль</span>
          <strong className="ops-metric__value">{roles.filter((role) => roleUserCounts[role] > 0).length}</strong>
          <span className="ops-metric__note">Ролей используется из {roles.length}</span>
        </div>
      </section>

      {activeSection !== "create" ? (
        <nav className="ops-tabs ops-tabs--section" aria-label="Разделы управления пользователями">
          {userSections.map((section) => (
            <Link
              key={section.value}
              href={usersSectionHref(section.value)}
              className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
              aria-current={activeSection === section.value ? "page" : undefined}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {activeSection === "directory" ? (
        <section className="ops-panel" aria-labelledby="users-directory-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Учетные записи</p>
              <h2 id="users-directory-title" className="ops-panel__title">Пользователи</h2>
              <p className="ops-panel__subtitle">Каждая строка сохраняется отдельно и сразу пишет событие аудита.</p>
            </div>
          </div>
          {usersSetupHint ? (
            <div className="admin-setup-inline">
              <CoachCallout
                title={usersSetupHint.title}
                body={usersSetupHint.body}
                href={usersSetupHint.href}
                actionLabel={usersSetupHint.actionLabel}
                variant="spotlight"
                placement="top"
                anchorLabel="Подсказка к пользователям"
                stepIndex={1}
                dismissId="settings:users"
              />
            </div>
          ) : null}
          <div className="ops-table-shell">
            <div className="ops-table ops-table--users" role="table" aria-label="Пользователи">
              <div className="ops-table__row ops-table__row--head" role="row">
                <span>Пользователь</span>
                <span>Роль</span>
                <span>Команда и линия</span>
                <span>Вход и активность</span>
                <span>Действие</span>
              </div>
              {users.map((managedUser) => {
                const activeUserSessions = activeSessionsByUser.get(managedUser.id) ?? 0;

                return (
                  <form key={managedUser.id} action={updateUserAccess} className="ops-table__row ops-table__row--form" role="row">
                    <input type="hidden" name="userId" value={managedUser.id} />
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Пользователь</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <strong className="record-title">{managedUser.name}</strong>
                        {managedUser.id === currentUser.id ? <span className="pill pill--neutral">Вы</span> : null}
                      </span>
                      <span className="record-meta compact-text">{managedUser.email}</span>
                    </div>
                    <label className="ops-table__cell text-sm font-medium text-[#334155]">
                      <span className="ops-table__label">Роль</span>
                      <RoleSelect defaultValue={managedUser.role} />
                      <span className={`pill ${roleTone(managedUser.role)}`}>{roleLabels[managedUser.role]}</span>
                    </label>
                    <div className="ops-table__cell ops-table__cell--stacked">
                      <label className="grid gap-1 text-sm font-medium text-[#334155]">
                        Команда
                        <input name="teamName" defaultValue={managedUser.teamName ?? ""} className="form-control" placeholder="Команда" />
                      </label>
                      <label className="grid gap-1 text-sm font-medium text-[#334155]">
                        Линия поддержки
                        <input name="supportLine" defaultValue={managedUser.supportLine ?? ""} className="form-control" placeholder="Линия" />
                      </label>
                    </div>
                    <div className="ops-table__cell">
                      <span className="ops-table__label">Вход и активность</span>
                      <span className="record-title record-title--tight">{loginLabel(managedUser.localCredential?.login)}</span>
                      <span className="record-meta">Последний локальный вход: {formatDate(managedUser.localCredential?.lastLoginAt)}</span>
                      <span className="record-meta">
                        Активных сессий: {activeUserSessions} · проверок: {managedUser._count.reviews} · внешних профилей:{" "}
                        {managedUser._count.externalIdentities}
                      </span>
                    </div>
                    <div className="ops-table__cell ops-table__cell--actions">
                      <span className="ops-table__label">Действие</span>
                      <button type="submit" className="action-button action-button--small whitespace-nowrap">
                        Сохранить
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "create" ? (
        <section className="ops-panel" aria-labelledby="new-user-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Создание</p>
              <h2 id="new-user-title" className="ops-panel__title">Новый пользователь</h2>
              <p className="ops-panel__subtitle">Локальный логин создается вместе с учетной записью; внешний профиль привяжется после первого входа.</p>
            </div>
            <Link href={usersSectionHref("directory")} className="action-button action-button--small">
              <ArrowLeft size={14} aria-hidden="true" />
              К списку пользователей
            </Link>
          </div>
          <form action={createLocalUser} className="grid gap-4 p-5">
            <div className="ops-form-grid ops-form-grid--three">
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Имя
                <input name="name" required className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Email
                <input name="email" type="email" autoComplete="email" required className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Логин
                <input name="login" autoComplete="username" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Временный пароль
                <input name="password" type="password" autoComplete="new-password" minLength={8} required className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Роль
                <RoleSelect defaultValue="QA_ANALYST" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Команда
                <input name="teamName" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Линия поддержки
                <input name="supportLine" className="form-control" />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={usersSectionHref("directory")} className="action-button">
                <ArrowLeft size={16} aria-hidden="true" />
                К списку
              </Link>
              <ValidatedSubmitButton>
                <KeyRound size={16} aria-hidden="true" />
                Создать
              </ValidatedSubmitButton>
            </div>
          </form>
        </section>
      ) : null}

      {activeSection === "roles" ? (
        <section className="ops-panel" aria-labelledby="role-matrix-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Матрица ролей</p>
              <h2 id="role-matrix-title" className="ops-panel__title">Права по ролям</h2>
              <p className="ops-panel__subtitle">Права не назначаются вручную: роль определяет весь набор доступов.</p>
            </div>
          </div>
          <div className="role-matrix-list">
            {permissionGroups.map((group) => (
              <article key={group.title} className="role-matrix-card">
                <div className="role-matrix-card__intro">
                  <h3 className="record-title">{group.title}</h3>
                  <p className="record-meta">{group.description}</p>
                </div>
                <div className="role-matrix-card__roles">
                  {roles.map((role) => {
                    const summary = permissionSummary(role, group.permissions);

                    return (
                      <div key={role} className="role-matrix-card__role">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="record-title record-title--tight">{roleLabels[role]}</span>
                          <span className={`ops-check ${summary.enabled.length > 0 ? "ops-check--on" : "ops-check--off"}`}>{summary.label}</span>
                        </div>
                        <p className="record-meta compact-text">
                          {summary.enabled.length > 0 ? summary.enabled.map((permission) => permissionLabels[permission]).join(", ") : "Нет доступа"}
                        </p>
                        <p className="record-meta">Пользователей: {roleUserCounts[role]}</p>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
