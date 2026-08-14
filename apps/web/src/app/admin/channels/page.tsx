import { AlertTriangle, MessageCircle, Plus, Send, Slack, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatusBadge, type StatusBadgeTone } from "@/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import {
  MessagingChannelForm,
  MessagingChannelStatusToggle
} from "@/components/admin/messaging-channel-form";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { messagingChannelRegistry } from "@/lib/messaging/registry";
import { maskSecret } from "@/lib/secrets";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Иконки каналов по kind — используются в списке и в диалоге «Добавить канал». */
const messagingChannelIcons: Record<string, LucideIcon> = {
  slack: Slack,
  teams: UsersRound,
  telegram: Send,
  whatsapp: MessageCircle
};

function formatDate(value: Date | null | undefined) {
  if (!value) {
    return "Нет данных";
  }

  return value.toLocaleString("ru-RU");
}

function messagingChannelStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    draft: "Черновик",
    disabled: "Отключен",
    error: "Ошибка"
  };

  return labels[status] ?? status;
}

function messagingDeliveryStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "В очереди",
    delivered: "Доставлено",
    failed: "Ошибка",
    skipped: "Пропущено"
  };

  return labels[status] ?? status;
}

function messagingDeliveryTone(status: string): StatusBadgeTone {
  if (status === "delivered") return "success";
  if (status === "failed") return "danger";
  if (status === "queued") return "warning";
  return "neutral";
}

function messagingChannelTone(status: string): StatusBadgeTone {
  if (status === "active") return "success";
  if (status === "error") return "danger";
  if (status === "disabled") return "warning";
  return "neutral";
}

function parseCapabilities(value: string | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // Fall through to the comma-separated legacy format.
  }

  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseWebhookUrl(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).webhookUrl === "string") {
      const webhookUrl = (parsed as Record<string, string>).webhookUrl.trim();
      return webhookUrl || null;
    }
  } catch {
    // Malformed config — treat as unset rather than throwing in the admin view.
  }

  return null;
}

function messagingCapabilityLabel(value: string) {
  const labels: Record<string, string> = {
    action_notification: "исходящие уведомления",
    conversation_ingest: "прием диалогов"
  };

  return labels[value] ?? value;
}

function messagingEventTypeLabel(value: string) {
  const labels: Record<string, string> = {
    source_certification_lost: "сертификация источника",
    training_overdue: "просрочено обучение",
    queue_without_start: "очередь без старта",
    risk_spike: "рост риска"
  };

  return labels[value] ?? value;
}

function messagingRecipientLabel(value: string) {
  const labels: Record<string, string> = {
    reviewer: "проверяющий",
    manager: "руководитель",
    admin: "администратор",
    assignee: "исполнитель"
  };

  return labels[value] ?? value;
}

export default function AdminChannelsPage() {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/channels")} />}>
      <AdminChannelsPageContent />
    </Suspense>
  );
}

async function AdminChannelsPageContent() {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const [messagingChannels, queuedDeliveries, failedDeliveries, deliveredDeliveries, recentDeliveries] = await Promise.all([
    prisma.messagingChannel.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ kind: "asc" }],
      include: {
        _count: {
          select: {
            deliveries: true
          }
        }
      }
    }),
    prisma.messagingDelivery.count({ where: { workspaceId: user.workspaceId, status: "queued" } }),
    prisma.messagingDelivery.count({ where: { workspaceId: user.workspaceId, status: "failed" } }),
    prisma.messagingDelivery.count({ where: { workspaceId: user.workspaceId, status: "delivered" } }),
    prisma.messagingDelivery.findMany({
      where: { workspaceId: user.workspaceId },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
      include: {
        channel: {
          select: {
            displayName: true,
            status: true
          }
        }
      }
    })
  ]);
  const configuredChannelByKind = new Map(messagingChannels.map((channel) => [channel.kind, channel]));
  const activeActionChannels = messagingChannels.filter((channel) => channel.status === "active").length;
  const latestDeliveries = recentDeliveries.slice(0, 3);
  const registryDefinitions = Object.values(messagingChannelRegistry);
  // В основном списке — только каналы с записью в БД (любой статус); остальные подключаются через «Добавить канал».
  const configuredDefinitions = registryDefinitions.filter((definition) => configuredChannelByKind.has(definition.kind));
  const unconfiguredDefinitions = registryDefinitions.filter((definition) => !configuredChannelByKind.has(definition.kind));

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/channels"]}
      description="Исходящие уведомления в Slack, Microsoft Teams, Telegram и WhatsApp: готовность каналов, защитные проверки и очередь доставок."
    >
      <AdminFrame>
        <div className="grid gap-6">
          <Card>
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <CardTitle id="channels-title">Каналы</CardTitle>
                  <CardDescription>
                    Активных: {activeActionChannels} · настроено: {messagingChannels.length}
                  </CardDescription>
                </div>
                <CardAction>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={activeActionChannels > 0 ? "success" : "neutral"}>
                      Активны {activeActionChannels}
                    </StatusBadge>
                    <AdminDialog
                      triggerLabel={
                        <>
                          <Plus size={16} aria-hidden="true" />
                          Добавить канал
                        </>
                      }
                      triggerClassName={buttonVariants()}
                      title="Добавить канал"
                      description="Подключите Slack, Teams, Telegram или WhatsApp — уведомления начнут уходить после активации."
                    >
                      {unconfiguredDefinitions.length === 0 ? (
                        <EmptyState
                          size="inline"
                          icon={<Send size={20} aria-hidden="true" />}
                          title="Все каналы подключены"
                          description="Все доступные каналы уже настроены — управляйте ими в списке."
                        />
                      ) : (
                        <div className="grid gap-4">
                          {unconfiguredDefinitions.map((definition, index) => {
                            const ChannelIcon = messagingChannelIcons[definition.kind] ?? Send;

                            return (
                              <div
                                key={definition.kind}
                                className={cn("grid gap-3", index > 0 && "border-t border-border pt-4")}
                              >
                                <div className="grid gap-1">
                                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                                    <ChannelIcon size={16} aria-hidden="true" />
                                    {definition.displayName}
                                  </span>
                                  <p className="text-sm text-muted-foreground">
                                    {definition.capabilities.map(messagingCapabilityLabel).join(", ")} ·{" "}
                                    {definition.ingestRequiresConsent
                                      ? "прием сообщений выключен до согласия и правил хранения"
                                      : "только исходящие уведомления"}
                                  </p>
                                </div>
                                <MessagingChannelForm
                                  kind={definition.kind}
                                  displayName={definition.displayName}
                                  status="draft"
                                  maskedWebhook={null}
                                  hasSecret={false}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </AdminDialog>
                  </div>
                </CardAction>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 pt-(--card-spacing)">
              <StatStrip
                items={[
                  {
                    label: "Настроено",
                    value: messagingChannels.length,
                    tone: messagingChannels.length > 0 ? "info" : "neutral"
                  },
                  {
                    label: "В очереди",
                    value: queuedDeliveries,
                    tone: queuedDeliveries > 0 ? "warning" : "neutral"
                  },
                  {
                    label: "Ошибки",
                    value: failedDeliveries,
                    tone: failedDeliveries > 0 ? "danger" : "neutral"
                  },
                  {
                    label: "Доставлено",
                    value: deliveredDeliveries,
                    tone: deliveredDeliveries > 0 ? "success" : "neutral",
                    hint: "за все время"
                  }
                ]}
              />

              {failedDeliveries > 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Доставка уведомлений деградировала</AlertTitle>
                  <AlertDescription>
                    Проверьте последний error у канала и scope токена перед повторной отправкой.
                  </AlertDescription>
                </Alert>
              ) : null}

              {configuredDefinitions.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<Send size={20} aria-hidden="true" />}
                  title="Каналы не подключены"
                  description="Нажмите «Добавить канал» в шапке панели, чтобы подключить Slack, Teams, Telegram или WhatsApp."
                />
              ) : (
                <div className="grid gap-2">
                  {configuredDefinitions.map((definition) => {
                    const channel = configuredChannelByKind.get(definition.kind);
                    if (!channel) {
                      return null;
                    }

                    const ChannelIcon = messagingChannelIcons[definition.kind] ?? Send;
                    const capabilities = parseCapabilities(channel.capabilities);
                    const webhookUrl = parseWebhookUrl(channel.configJson);
                    const maskedWebhook = maskSecret(webhookUrl);
                    const hasSecret = Boolean(channel.secretRef);
                    const channelStatus = channel.status;
                    const isActive = channelStatus === "active";
                    const channelName = channel.displayName ?? definition.displayName;

                    return (
                      <div
                        key={definition.kind}
                        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="grid min-w-0 gap-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                            <ChannelIcon size={16} aria-hidden="true" />
                            {channelName}
                            <StatusBadge tone={messagingChannelTone(channelStatus)}>
                              {messagingChannelStatusLabel(channelStatus)}
                            </StatusBadge>
                          </span>
                          <p className="text-sm text-muted-foreground">
                            {capabilities.map(messagingCapabilityLabel).join(", ")} ·{" "}
                            {definition.ingestRequiresConsent
                              ? "прием сообщений выключен до согласия и правил хранения"
                              : "только исходящие уведомления"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <MessagingChannelStatusToggle kind={definition.kind} isActive={isActive} />
                          <AdminDialog
                            triggerLabel="Настроить"
                            triggerClassName={buttonVariants({ variant: "outline", size: "sm" })}
                            title={`Канал: ${channelName}`}
                          >
                            <div className="grid gap-3">
                              <MessagingChannelForm
                                kind={definition.kind}
                                displayName={channelName}
                                status={channelStatus}
                                maskedWebhook={maskedWebhook}
                                hasSecret={hasSecret}
                              />
                              <p className="text-sm tabular-nums text-muted-foreground">
                                Доставок: {channel?._count.deliveries ?? 0} · последняя:{" "}
                                {formatDate(channel?.lastDeliveredAt)}
                              </p>
                              {channel?.lastError ? (
                                <p className="text-sm font-medium text-destructive">{channel.lastError}</p>
                              ) : null}
                              <p>
                                <a
                                  href={definition.docsHref}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sm text-primary underline-offset-4 hover:underline"
                                >
                                  Документация канала
                                </a>
                              </p>
                            </div>
                          </AdminDialog>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card aria-labelledby="delivery-log-title">
            <CardHeader className="border-b">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle id="delivery-log-title">Журнал доставок</CardTitle>
                <span className="text-sm font-medium tabular-nums text-muted-foreground">
                  {latestDeliveries.length} последних
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-(--card-spacing)">
              {latestDeliveries.length === 0 ? (
                <EmptyState
                  size="inline"
                  icon={<Send size={20} aria-hidden="true" />}
                  title="Доставок пока нет"
                  description="Сообщения появятся здесь после первой отправки по каналам уведомлений."
                />
              ) : (
                <Table aria-labelledby="delivery-log-title">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Канал</TableHead>
                      <TableHead>Событие</TableHead>
                      <TableHead>Получатель</TableHead>
                      <TableHead>Когда</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действие</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestDeliveries.map((delivery) => (
                      <TableRow key={delivery.id}>
                        <TableCell className="font-medium">
                          {delivery.channel?.displayName ?? delivery.kind}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {messagingEventTypeLabel(delivery.eventType)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {messagingRecipientLabel(delivery.recipientType)}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatDate(delivery.createdAt)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge tone={messagingDeliveryTone(delivery.status)}>
                            {messagingDeliveryStatusLabel(delivery.status)}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="text-right">
                          {delivery.href ? (
                            <Button
                              render={<Link href={delivery.href} />}
                              nativeButton={false}
                              variant="link"
                              size="sm"
                            >
                              Открыть
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </AdminFrame>
    </PageShell>
  );
}
