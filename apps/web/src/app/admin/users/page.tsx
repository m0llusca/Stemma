import type { RoleName } from "@prisma/client";
import { KeyRound, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import Link from "next/link";
import { createLocalUser, updateUserAccess } from "@/lib/admin-user-actions";
import { getPermissions, type Permission } from "@/lib/auth/permissions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";

export const dynamic = "force-dynamic";

const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];

const permissionLabels: Record<Permission, string> = {
  "reviews:read": "Очередь проверок",
  "reviews:write": "Черновики оценок",
  "reviews:finalize": "Завершение проверок",
  "workflow:manage": "Статусы обращений",
  "feedback:acknowledge": "Апелляции и обратная связь",
  "self_review:write": "Самопроверка",
  "calibration:manage": "Калибровки",
  "reports:read": "Отчеты",
  "scorecards:manage": "Формы оценки",
  "sampling:manage": "Выборки",
  "integrations:manage": "Интеграции",
  "users:manage": "Пользователи и права",
  "appearance:manage": "Внешний вид",
  "api_tokens:manage": "API-ключи",
  "audit:read": "Журнал действий",
  "training:manage": "Обучение",
  "backend_jobs:manage": "Системные задачи",
  "auth_providers:manage": "SSO и группы",
  "privacy:manage": "Приватность"
};

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function loginLabel(value: string | null | undefined) {
  return value || "SSO/без локального логина";
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

export default async function AdminUsersPage() {
  const currentUser = await requireCurrentUserPermission("users:manage");
  const [users, activeSessions] = await Promise.all([
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
    prisma.authSession.count({
      where: {
        workspaceId: currentUser.workspaceId,
        status: "ACTIVE"
      }
    })
  ]);
  const localUsers = users.filter((user) => user.localCredential).length;
  const adminUsers = users.filter((user) => user.role === "ADMIN").length;

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div>
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Пользователи и права</h1>
          <p className="page-subtitle">
            Создавайте локальные учетные записи и назначайте роли, которые определяют доступ к разделам проекта.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/access" className="action-button">
            <ShieldCheck size={16} aria-hidden="true" />
            SSO и сессии
          </Link>
          <a href="#new-user" className="action-button action-button--primary">
            <UserCog size={16} aria-hidden="true" />
            Создать пользователя
          </a>
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-3" aria-label="Сводка пользователей">
        <div className="soft-callout">
          <span className="soft-callout__label">Пользователи</span>
          <strong className="soft-callout__value">{users.length}</strong>
        </div>
        <div className="soft-callout">
          <span className="soft-callout__label">Локальный вход</span>
          <strong className="soft-callout__value">{localUsers}</strong>
        </div>
        <div className="soft-callout">
          <span className="soft-callout__label">Активные сессии</span>
          <strong className="soft-callout__value">{activeSessions}</strong>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Учетные записи</h2>
            <p className="mt-1 text-sm text-[#64748b]">Роль применяется сразу после сохранения и влияет на новые запросы пользователя.</p>
          </div>
          <div className="record-list px-5">
            {users.map((managedUser) => (
              <article key={managedUser.id} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="record-title">{managedUser.name}</h3>
                      <span className={`pill ${roleTone(managedUser.role)}`}>{roleLabels[managedUser.role]}</span>
                    </div>
                    <p className="record-meta mt-1">
                      {managedUser.email} · {loginLabel(managedUser.localCredential?.login)}
                    </p>
                  </div>
                  {managedUser.id === currentUser.id ? <span className="pill pill--neutral">Вы</span> : null}
                </div>

                <form action={updateUserAccess} className="grid gap-3 pt-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                  <input type="hidden" name="userId" value={managedUser.id} />
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
                    Права
                    <RoleSelect defaultValue={managedUser.role} />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
                    Команда
                    <input name="teamName" defaultValue={managedUser.teamName ?? ""} className="form-control" />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
                    Линия поддержки
                    <input name="supportLine" defaultValue={managedUser.supportLine ?? ""} className="form-control" />
                  </label>
                  <button type="submit" className="action-button min-h-[40px] px-3 py-2 text-sm">
                    Сохранить
                  </button>
                </form>

                <div className="record-row pt-2">
                  <p className="record-meta">
                    Проверок: {managedUser._count.reviews} · SSO-связей: {managedUser._count.externalIdentities} · сессий:{" "}
                    {managedUser._count.authSessions}
                  </p>
                  <p className="record-meta">Последний локальный вход: {formatDate(managedUser.localCredential?.lastLoginAt)}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-6">
          <details id="new-user" className="disclosure-panel panel overflow-hidden" open>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Новый пользователь</h2>
                <p className="mt-1 text-sm text-[#64748b]">Локальный логин создается вместе с учетной записью.</p>
              </div>
              <UsersRound size={18} aria-hidden="true" />
            </summary>
            <form action={createLocalUser} className="grid gap-4 p-5">
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
                Права
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
              <ValidatedSubmitButton>
                <KeyRound size={16} aria-hidden="true" />
                Создать
              </ValidatedSubmitButton>
            </form>
          </details>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#d9e0ea] px-5 py-4">
              <h2 className="text-lg font-semibold">Права по ролям</h2>
              <p className="mt-1 text-sm text-[#64748b]">В проекте права назначаются через роль пользователя.</p>
            </div>
            <div className="record-list px-5">
              {roles.map((role) => {
                const permissions = getPermissions(role);

                return (
                  <article key={role} className="record-card">
                    <div className="record-row">
                      <h3 className="record-title">{roleLabels[role]}</h3>
                      <span className={`pill ${roleTone(role)}`}>{role === "ADMIN" ? adminUsers : permissions.length}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {permissions.length > 0 ? (
                        permissions.map((permission) => (
                          <span key={permission} className="pill pill--neutral">
                            {permissionLabels[permission]}
                          </span>
                        ))
                      ) : (
                        <span className="record-meta">Доступ к рабочим разделам отключен.</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
