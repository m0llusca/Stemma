import { History, KeyRound, Plug } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ApiTokenCreateForm } from "@/components/admin/api-token-create-form";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { CopyButton } from "@/components/copy-button";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { PageShell } from "@/components/ui/page-shell";
import { StatKpi } from "@/components/ui/stat-kpi";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminFrame } from "@/components/admin/admin-frame";
import { AdminSectionTabs } from "@/components/admin/admin-section-tabs";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { allowedApiScopes } from "@/lib/api-token-service";
import { revokeApiTokenById } from "@/lib/api-token-actions";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { isDemoAuthEnabled, requireCurrentUserPermission } from "@/lib/current-user";
import { apiTokenPlaceholder, demoApiToken } from "@/lib/custom-api-docs";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type AdminTokensPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type TokensSection = "tokens" | "create" | "local";

const tokenSections: Array<{ value: TokensSection; label: string }> = [
  { value: "tokens", label: "Ключи" },
  { value: "local", label: "Локальная проверка" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function tokensSectionParam(value: string | string[] | undefined): TokensSection {
  const section = firstParam(value);

  // «create» — не вкладка контента, а deep-link на открытое окно создания ключа.
  if (section === "create") {
    return "create";
  }

  return tokenSections.some((item) => item.value === section) ? (section as TokensSection) : "tokens";
}

function tokensSectionHref(section: TokensSection) {
  return `/admin/tokens?section=${section}`;
}

function formatDate(value: Date | null) {
  if (!value) {
    return "Нет";
  }

  return value.toLocaleString("ru-RU");
}

function formatScopes(scopes: string) {
  return scopes
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(", ");
}

function tokenHealth(token: {
  expiresAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
}): { label: string; tone: ChipTone } {
  if (token.expiresAt && token.expiresAt <= new Date()) {
    return { label: "Истек", tone: "warning" };
  }

  if (token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)) {
    return { label: "Ошибка", tone: "danger" };
  }

  if (token.lastSuccessAt) {
    return { label: "Работает", tone: "success" };
  }

  return { label: "Готов", tone: "neutral" };
}

export default function AdminTokensPage({ searchParams }: AdminTokensPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/tokens")} />}>
      <AdminTokensPageContent searchParams={searchParams} />
    </Suspense>
  );
}

export async function AdminTokensPageContent({ searchParams }: AdminTokensPageProps) {
  const params = await searchParams;
  const requestedSection = tokensSectionParam(params.section);
  // Deep-link ?section=create открывает окно создания поверх списка ключей.
  const createDialogOpen = requestedSection === "create";
  const activeSection: TokensSection = createDialogOpen ? "tokens" : requestedSection;
  const user = await requireCurrentUserPermission("api_tokens:manage");
  const apiTokens = await prisma.apiToken.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  const demoAuthEnabled = isDemoAuthEnabled();
  const authorizationHeader = `Authorization: Bearer ${demoApiToken}`;
  const now = new Date();
  const activeTokens = apiTokens.filter((token) => !token.expiresAt || token.expiresAt > now).length;
  const tokensWithErrors = apiTokens.filter((token) => token.lastError && token.lastErrorAt && (!token.lastSuccessAt || token.lastErrorAt > token.lastSuccessAt)).length;
  const apiTokenSetupHint = activeTokens > 0 ? null : getSettingCoachmark("apiTokens");

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/tokens"]}
      description="Рабочие ключи и локальный ключ для проверки интеграций. Технические поля собраны в компактные карточки."
    >
      <AdminFrame>
        <div className="grid gap-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Сводка API-ключей">
            <StatKpi label="Ключи" value={apiTokens.length} hint={`Активных: ${activeTokens}`} />
            <StatKpi label="Ошибки" value={tokensWithErrors} hint="По последней активности" />
            <StatKpi
              label={
                <span className="flex items-center gap-1">
                  Права
                  <HelpTooltip
                    label="Что такое scope API-ключа?"
                    content="Scope ограничивает, какие API endpoint может вызывать ключ. Для production выдавайте минимально нужный набор scope."
                    placement="top-start"
                  />
                </span>
              }
              value={allowedApiScopes.length}
              hint="Доступные области API"
            />
          </section>

          <AdminSectionTabs
            ariaLabel="Разделы API-доступа"
            items={tokenSections.map((section) => ({
              href: tokensSectionHref(section.value),
              label: section.label,
              active: activeSection === section.value,
              count: section.value === "tokens" ? apiTokens.length : undefined
            }))}
            actions={
              <>
                <AdminDialog
                  triggerLabel={
                    <>
                      <KeyRound size={16} aria-hidden="true" />
                      Новый ключ
                    </>
                  }
                  triggerClassName={buttonVariants()}
                  title="Новый ключ"
                  description="Создание идет через backend-сервис, секрет показывается только один раз после выпуска."
                  defaultOpen={createDialogOpen}
                >
                  <ApiTokenCreateForm scopes={allowedApiScopes} />
                </AdminDialog>
                <Button
                  render={<Link href="/admin/integrations" />}
                  nativeButton={false}
                  variant="outline"
                >
                  <Plug aria-hidden="true" />
                  Интеграции
                </Button>
                <Button
                  render={<Link href="/admin/audit" />}
                  nativeButton={false}
                  variant="ghost"
                >
                  <History aria-hidden="true" />
                  Журнал действий
                </Button>
              </>
            }
          />

          {activeSection === "tokens" ? (
            <Card>
              <CardHeader className="border-b">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Рабочее пространство
                    </p>
                    <CardTitle id="api-tokens-title">Ключи API</CardTitle>
                    <CardDescription>Статус, права и последняя активность.</CardDescription>
                  </div>
                  <StatusBadge tone="neutral">{apiTokens.length}</StatusBadge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 pt-(--card-spacing)">
                {apiTokenSetupHint ? (
                  <CoachCallout
                    title={apiTokenSetupHint.title}
                    body={apiTokenSetupHint.body}
                    href={apiTokenSetupHint.href}
                    actionLabel={apiTokenSetupHint.actionLabel}
                    variant="spotlight"
                    placement="top"
                    anchorLabel="Подсказка к API-ключам"
                    stepIndex={1}
                    dismissId="settings:apiTokens"
                  />
                ) : null}
                {apiTokens.length > 0 ? (
                  <Table aria-labelledby="api-tokens-title">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ключ</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Права</TableHead>
                        <TableHead>Использование</TableHead>
                        <TableHead>Истекает</TableHead>
                        <TableHead className="text-right">Действие</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {apiTokens.map((apiToken) => {
                        const health = tokenHealth(apiToken);
                        const isExpired = Boolean(apiToken.expiresAt && apiToken.expiresAt <= now);

                        return (
                          <TableRow key={apiToken.id}>
                            <TableCell>
                              <div className="grid gap-0.5">
                                <span className="font-medium text-foreground">{apiToken.name}</span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {apiToken.tokenPrefix}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Chip tone={health.tone}>{health.label}</Chip>
                            </TableCell>
                            <TableCell className="max-w-[14rem] whitespace-normal text-muted-foreground">
                              {formatScopes(apiToken.scopes)}
                            </TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              <div className="grid gap-0.5 text-xs">
                                <span>Исп.: {formatDate(apiToken.lastUsedAt)}</span>
                                <span>Успех: {formatDate(apiToken.lastSuccessAt)}</span>
                                {apiToken.lastError ? (
                                  <span className="text-destructive">
                                    Ошибка: {formatDate(apiToken.lastErrorAt)} · {apiToken.lastError}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums text-muted-foreground">
                              {formatDate(apiToken.expiresAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <form action={revokeApiTokenById}>
                                <input type="hidden" name="tokenId" value={apiToken.id} />
                                <ConfirmSubmitButton
                                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                                  disabled={isExpired}
                                  aria-label={`Отозвать ключ ${apiToken.name}`}
                                  confirmMessage={`Отозвать ключ «${apiToken.name}»? Действие необратимо: интеграции с этим ключом перестанут работать.`}
                                >
                                  Отозвать
                                </ConfirmSubmitButton>
                              </form>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState
                    size="inline"
                    icon={<KeyRound size={20} aria-hidden="true" />}
                    title="Ключи еще не созданы"
                    description="Создайте рабочий ключ, чтобы интеграции и кастомные источники могли обращаться к API."
                    action={
                      <Button
                        render={<Link href={tokensSectionHref("create")} />}
                        nativeButton={false}
                        size="sm"
                      >
                        Новый ключ
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          ) : null}

          {activeSection === "local" ? (
            <Card>
              <CardHeader className="border-b">
                <div className="grid gap-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Проверка
                  </p>
                  <CardTitle id="local-api-token-title">Локальная проверка</CardTitle>
                  <CardDescription>
                    Плейсхолдер {apiTokenPlaceholder} и реальные значения для тестовых запросов.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="pt-(--card-spacing)">
                {demoAuthEnabled ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">Ключ</span>
                        <CopyButton value={demoApiToken} label="Скопировать ключ" />
                      </div>
                      <code className="break-all rounded-md border border-border bg-card px-2.5 py-2 font-mono text-xs text-foreground">
                        {demoApiToken}
                      </code>
                    </div>
                    <div className="grid gap-2 rounded-xl border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">Заголовок Authorization</span>
                        <CopyButton value={authorizationHeader} label="Скопировать заголовок" />
                      </div>
                      <code className="break-all rounded-md border border-border bg-card px-2.5 py-2 font-mono text-xs text-foreground">
                        {authorizationHeader}
                      </code>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    size="inline"
                    icon={<KeyRound size={20} aria-hidden="true" />}
                    title="Демо-ключ недоступен"
                    description="Демо-ключ показывается только при включенном демо-режиме."
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </AdminFrame>
    </PageShell>
  );
}
