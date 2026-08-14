import type { RoleName } from "@prisma/client";
import { KeyRound, ShieldCheck, UserCog, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CreateUserDialog } from "@/app/admin/users/create-user-dialog";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { createLocalUser, updateUserAccess } from "@/lib/admin-user-actions";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { getPermissions, type Permission } from "@/lib/auth/permissions";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { StatKpi } from "@/components/ui/stat-kpi";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AdminUsersPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type UsersSection = "directory" | "create" | "roles";

const roles: RoleName[] = ["ADMIN", "TEAM_LEAD", "QA_ANALYST", "SUPPORT_AGENT", "VIEWER"];

const roleSelectItems = Object.fromEntries(roles.map((role) => [role, roleLabels[role]])) as Record<
  RoleName,
  string
>;

const userSections: Array<{ value: UsersSection; label: string }> = [
  { value: "directory", label: "Пользователи" },
  { value: "roles", label: "Роли" }
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
    permissions: [
      "reviews:read",
      "reviews:write",
      "reviews:finalize",
      "workflow:manage",
      "feedback:acknowledge",
      "self_review:write"
    ]
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
    permissions: [
      "integrations:manage",
      "users:manage",
      "auth_providers:manage",
      "api_tokens:manage",
      "backend_jobs:manage",
      "appearance:manage",
      "privacy:manage"
    ]
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

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function loginLabel(value: string | null | undefined) {
  return value || "SSO";
}

function roleBadgeClass(role: RoleName) {
  if (role === "ADMIN") {
    return cn("border-transparent", statusSurfaceClass("warning"));
  }

  return undefined;
}

function RoleSelect({
  defaultValue,
  form,
  className
}: {
  defaultValue: RoleName;
  form?: string;
  className?: string;
}) {
  return (
    <Select name="role" defaultValue={defaultValue} form={form} items={roleSelectItems}>
      <SelectTrigger className={cn("w-full min-w-40", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {roleLabels[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function permissionSummary(role: RoleName, permissions: Permission[]) {
  const enabled = permissions.filter((permission) => getPermissions(role).includes(permission));

  return {
    enabled,
    label:
      enabled.length === permissions.length
        ? "Все"
        : enabled.length > 0
          ? `${enabled.length}/${permissions.length}`
          : "Нет"
  };
}

export default function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/users")} />}>
      <AdminUsersPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminUsersPageContent({ searchParams }: AdminUsersPageProps) {
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
  // Deep-link ?section=create / ?create=1: показываем директорию с открытым окном.
  const createDialogOpen = activeSection === "create";
  const visibleSection: UsersSection = createDialogOpen ? "directory" : activeSection;
  const usersSetupHint = users.length > 1 ? null : getSettingCoachmark("users");
  const rolesInUse = roles.filter((role) => roleUserCounts[role] > 0).length;

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/users"]}
      description="Управление учетными записями, ролями, командами, линиями поддержки и доступом без длинных скрытых блоков."
    >
      <AdminFrame>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Сводка пользователей">
          <StatKpi label="Пользователи" value={users.length} hint={`Администраторов: ${adminUsers}`} />
          <StatKpi label="Локальный вход" value={localUsers} hint={`SSO-связи: ${ssoLinkedUsers}`} />
          <StatKpi label="Активные сессии" value={activeSessions} hint="Последние входы видны по пользователям" />
          <StatKpi
            label="Ролевой контроль"
            value={`${rolesInUse} / ${roles.length}`}
            hint="Ролей используется из общего числа"
          />
        </section>

        <AdminSectionTabs
          ariaLabel="Разделы управления пользователями"
          items={userSections.map((section) => ({
            href: usersSectionHref(section.value),
            label: section.label,
            active: visibleSection === section.value,
            count: section.value === "directory" ? users.length : undefined
          }))}
          actions={
            <>
              <CreateUserDialog
                triggerLabel={
                  <>
                    <UserCog className="size-4" aria-hidden="true" />
                    Создать пользователя
                  </>
                }
                title="Новый пользователь"
                description="Локальный логин создается вместе с учетной записью; внешний профиль привяжется после первого входа."
                defaultOpen={createDialogOpen}
              >
                <form action={createLocalUser} className="grid gap-4">
                  <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="create-user-name">
                        Имя
                        <RequiredMark />
                      </FieldLabel>
                      <Input id="create-user-name" name="name" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-user-email">
                        Email
                        <RequiredMark />
                      </FieldLabel>
                      <Input
                        id="create-user-email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-user-login">Логин</FieldLabel>
                      <Input id="create-user-login" name="login" autoComplete="username" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-user-password">
                        Временный пароль
                        <RequiredMark />
                      </FieldLabel>
                      <Input
                        id="create-user-password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Роль</FieldLabel>
                      <RoleSelect defaultValue="QA_ANALYST" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-user-team">Команда</FieldLabel>
                      <Input id="create-user-team" name="teamName" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="create-user-line">Линия поддержки</FieldLabel>
                      <Input id="create-user-line" name="supportLine" />
                    </Field>
                  </FieldGroup>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button type="submit">
                      <KeyRound data-icon="inline-start" aria-hidden="true" />
                      Создать
                    </Button>
                  </div>
                </form>
              </CreateUserDialog>
              <Button
                variant="outline"
                render={<Link href="/admin/access" />}
                nativeButton={false}
              >
                <ShieldCheck data-icon="inline-start" aria-hidden="true" />
                SSO и сессии
              </Button>
            </>
          }
        />

        {visibleSection === "directory" ? (
          <Card aria-labelledby="users-directory-title">
            <CardHeader className="border-b border-border pb-(--card-spacing)">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Учетные записи
              </p>
              <CardTitle id="users-directory-title">Пользователи</CardTitle>
              <CardDescription>
                Каждая строка сохраняется отдельно и сразу пишет событие аудита.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
              {usersSetupHint ? (
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
              ) : null}
              {users.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<UsersRound className="size-5" aria-hidden="true" />}
                  title="Пользователей пока нет"
                  description="Создайте первую учетную запись, чтобы выдать доступ к рабочему пространству."
                  action={
                    <Button size="sm" render={<Link href={usersSectionHref("create")} />} nativeButton={false}>
                      Новый пользователь
                    </Button>
                  }
                />
              ) : (
                <>
                  {users.map((managedUser) => (
                    <form
                      key={`form-${managedUser.id}`}
                      id={`user-access-${managedUser.id}`}
                      action={updateUserAccess}
                      className="hidden"
                      aria-hidden="true"
                    >
                      <input type="hidden" name="userId" value={managedUser.id} />
                    </form>
                  ))}
                  <Table aria-label="Пользователи">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Пользователь</TableHead>
                        <TableHead>Роль</TableHead>
                        <TableHead>Команда и линия</TableHead>
                        <TableHead>Вход и активность</TableHead>
                        <TableHead className="text-right">Действие</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((managedUser) => {
                        const activeUserSessions = activeSessionsByUser.get(managedUser.id) ?? 0;
                        const formId = `user-access-${managedUser.id}`;

                        return (
                          <TableRow key={managedUser.id}>
                            <TableCell className="min-w-48 whitespace-normal align-top">
                              <div className="flex flex-col gap-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-medium text-foreground">{managedUser.name}</span>
                                  {managedUser.id === currentUser.id ? (
                                    <Badge variant="default">Вы</Badge>
                                  ) : null}
                                </span>
                                <span className="text-xs text-muted-foreground">{managedUser.email}</span>
                              </div>
                            </TableCell>
                            <TableCell className="min-w-44 whitespace-normal align-top">
                              <div className="flex flex-col gap-2">
                                <RoleSelect defaultValue={managedUser.role} form={formId} />
                                <Badge
                                  variant={managedUser.role === "ADMIN" ? "outline" : "secondary"}
                                  className={cn("w-fit", roleBadgeClass(managedUser.role))}
                                >
                                  {roleLabels[managedUser.role]}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="min-w-52 whitespace-normal align-top">
                              <FieldGroup className="gap-2">
                                <Field>
                                  <FieldLabel
                                    htmlFor={`team-${managedUser.id}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    Команда
                                  </FieldLabel>
                                  <Input
                                    id={`team-${managedUser.id}`}
                                    name="teamName"
                                    form={formId}
                                    defaultValue={managedUser.teamName ?? ""}
                                    placeholder="Команда"
                                  />
                                </Field>
                                <Field>
                                  <FieldLabel
                                    htmlFor={`line-${managedUser.id}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    Линия поддержки
                                  </FieldLabel>
                                  <Input
                                    id={`line-${managedUser.id}`}
                                    name="supportLine"
                                    form={formId}
                                    defaultValue={managedUser.supportLine ?? ""}
                                    placeholder="Линия"
                                  />
                                </Field>
                              </FieldGroup>
                            </TableCell>
                            <TableCell className="min-w-56 whitespace-normal align-top">
                              <div className="flex flex-col gap-1">
                                <span className="font-medium text-foreground">
                                  {loginLabel(managedUser.localCredential?.login)}
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  Последний локальный вход:{" "}
                                  {formatDate(managedUser.localCredential?.lastLoginAt)}
                                </span>
                                <span className="text-xs tabular-nums text-muted-foreground">
                                  Активных сессий: {activeUserSessions} · проверок:{" "}
                                  {managedUser._count.reviews} · внешних профилей:{" "}
                                  {managedUser._count.externalIdentities}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-nowrap align-top text-right">
                              <Button type="submit" form={formId} size="sm">
                                Сохранить
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {visibleSection === "roles" ? (
          <Card aria-labelledby="role-matrix-title">
            <CardHeader className="border-b border-border pb-(--card-spacing)">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Матрица ролей
              </p>
              <CardTitle id="role-matrix-title">Права по ролям</CardTitle>
              <CardDescription>
                Права не назначаются вручную: роль определяет весь набор доступов.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-(--card-spacing)">
              {permissionGroups.map((group) => (
                <Card key={group.title} size="sm" className="bg-muted/20">
                  <CardHeader>
                    <CardTitle className="text-sm">{group.title}</CardTitle>
                    <CardDescription>{group.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {roles.map((role) => {
                      const summary = permissionSummary(role, group.permissions);

                      return (
                        <div
                          key={role}
                          className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {roleLabels[role]}
                            </span>
                            <Badge variant={summary.enabled.length > 0 ? "default" : "secondary"}>
                              {summary.label}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {summary.enabled.length > 0
                              ? summary.enabled.map((permission) => permissionLabels[permission]).join(", ")
                              : "Нет доступа"}
                          </p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            Пользователей: {roleUserCounts[role]}
                          </p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </AdminFrame>
    </PageShell>
  );
}
