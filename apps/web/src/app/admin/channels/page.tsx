import { AlertTriangle, MessageCircle, Plus, Send, Slack, UsersRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFrame } from "@/components/admin/admin-frame";
import { MessagingChannelForm } from "@/components/admin/messaging-channel-form";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { setMessagingChannelStatus } from "@/lib/messaging-actions";
import { messagingChannelRegistry } from "@/lib/messaging/registry";
import { maskSecret } from "@/lib/secrets";
import type { StatusTone } from "@/lib/ui/status-tone";

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

function messagingDeliveryTone(status: string): StatusTone {
  if (status === "delivered") return "positive";
  if (status === "failed") return "negative";
  if (status === "queued") return "warning";
  return "neutral";
}

function messagingChannelTone(status: string): StatusTone {
  if (status === "active") return "positive";
  if (status === "error") return "negative";
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
        <section className="ops-panel" aria-labelledby="channels-title">
          <div className="ops-panel__header">
            <h2 id="channels-title" className="ops-panel__title">Каналы</h2>
            <div className="admin-actions">
              <StatusBadge label="Активны" value={activeActionChannels} tone={activeActionChannels > 0 ? "positive" : "neutral"} />
              <AdminDialog
                triggerLabel={
                  <>
                    <Plus size={16} aria-hidden="true" />
                    Добавить канал
                  </>
                }
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
                        <div key={definition.kind} className={index > 0 ? "border-t border-[var(--border)] pt-4" : undefined}>
                          <div className="setting-row__copy">
                            <span className="setting-row__label">
                              <ChannelIcon size={16} aria-hidden="true" />
                              {definition.displayName}
                            </span>
                            <p className="setting-row__hint">
                              {definition.capabilities.map(messagingCapabilityLabel).join(", ")} · {definition.ingestRequiresConsent ? "прием сообщений выключен до согласия и правил хранения" : "только исходящие уведомления"}
                            </p>
                          </div>
                          <div className="mt-3">
                            <MessagingChannelForm
                              kind={definition.kind}
                              displayName={definition.displayName}
                              status="draft"
                              maskedWebhook={null}
                              hasSecret={false}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </AdminDialog>
            </div>
          </div>
          <div className="px-5 pt-1">
            <StatStrip
              ariaLabel="Сводка каналов и доставок"
              items={[
                { label: "Настроено", value: messagingChannels.length, tone: messagingChannels.length > 0 ? "accent" : "neutral" },
                { label: "В очереди", value: queuedDeliveries, tone: queuedDeliveries > 0 ? "warning" : "neutral" },
                { label: "Ошибки", value: failedDeliveries, tone: failedDeliveries > 0 ? "danger" : "neutral" },
                { label: "Доставлено", value: deliveredDeliveries, tone: deliveredDeliveries > 0 ? "success" : "neutral", hint: "за все время" }
              ]}
            />
          </div>
          {failedDeliveries > 0 ? (
            <div className="system-attention system-attention--negative">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <p className="system-attention__title">Доставка уведомлений деградировала</p>
                <p className="system-attention__text">Проверьте последний error у канала и scope токена перед повторной отправкой.</p>
              </div>
            </div>
          ) : null}
          <div className="p-5 pt-2">
            {configuredDefinitions.length === 0 ? (
              <EmptyState
                size="inline"
                icon={<Send size={20} aria-hidden="true" />}
                title="Каналы не подключены"
                description="Нажмите «Добавить канал» в шапке панели, чтобы подключить Slack, Teams, Telegram или WhatsApp."
              />
            ) : (
              <div className="setting-rows">
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
                    <div key={definition.kind} className="setting-row">
                      <div className="setting-row__copy">
                        <span className="setting-row__label">
                          <ChannelIcon size={16} aria-hidden="true" />
                          {channelName}
                          <StatusBadge compact
                            label="Статус"
                            value={messagingChannelStatusLabel(channelStatus)}
                            tone={messagingChannelTone(channelStatus)}
                          />
                        </span>
                        <p className="setting-row__hint">
                          {capabilities.map(messagingCapabilityLabel).join(", ")} · {definition.ingestRequiresConsent ? "прием сообщений выключен до согласия и правил хранения" : "только исходящие уведомления"}
                        </p>
                      </div>
                      <div className="setting-row__control">
                        <form action={setMessagingChannelStatus}>
                          <input type="hidden" name="kind" value={definition.kind} />
                          <input type="hidden" name="status" value={isActive ? "draft" : "active"} />
                          <button type="submit" className="action-button action-button--small">
                            {isActive ? "В черновик" : "Активировать"}
                          </button>
                        </form>
                        <AdminDialog
                          triggerLabel="Настроить"
                          triggerClassName="action-button action-button--small"
                          title={`Канал: ${channelName}`}
                        >
                          <MessagingChannelForm
                            kind={definition.kind}
                            displayName={channelName}
                            status={channelStatus}
                            maskedWebhook={maskedWebhook}
                            hasSecret={hasSecret}
                          />
                          <p className="record-meta tabular-nums mt-2">
                            Доставок: {channel?._count.deliveries ?? 0} · последняя: {formatDate(channel?.lastDeliveredAt)}
                          </p>
                          {channel?.lastError ? <p className="mt-2 text-sm font-medium text-[var(--danger)]">{channel.lastError}</p> : null}
                          <p className="mt-2">
                            <a href={definition.docsHref} target="_blank" rel="noreferrer" className="quiet-link text-sm">
                              Документация канала
                            </a>
                          </p>
                        </AdminDialog>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <section className="mt-6" aria-labelledby="delivery-log-title">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 id="delivery-log-title" className="font-semibold text-[var(--foreground)]">Журнал доставок</h3>
                <span className="text-sm font-semibold tabular-nums text-[var(--accent-strong)]">{latestDeliveries.length} последних</span>
              </div>
              {latestDeliveries.length === 0 ? (
                <EmptyState size="inline" icon={<Send size={20} aria-hidden="true" />} title="Доставок пока нет" description="Сообщения появятся здесь после первой отправки по каналам уведомлений." />
              ) : (
                <div className="setting-rows">
                  {latestDeliveries.map((delivery) => (
                    <div key={delivery.id} className="setting-row">
                      <div className="setting-row__copy">
                        <span className="setting-row__label">{delivery.channel?.displayName ?? delivery.kind}</span>
                        <p className="setting-row__hint tabular-nums">
                          {formatDate(delivery.createdAt)} · {messagingEventTypeLabel(delivery.eventType)} · {messagingRecipientLabel(delivery.recipientType)}
                        </p>
                      </div>
                      <div className="setting-row__control">
                        <StatusBadge compact label="Статус" value={messagingDeliveryStatusLabel(delivery.status)} tone={messagingDeliveryTone(delivery.status)} />
                        {delivery.href ? <Link href={delivery.href} className="quiet-link text-sm">Открыть действие</Link> : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </AdminFrame>
    </PageShell>
  );
}
