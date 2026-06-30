import { AlertTriangle, ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { AdminFrame } from "@/components/admin/admin-frame";
import { MessagingChannelForm } from "@/components/admin/messaging-channel-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { setMessagingChannelStatus } from "@/lib/messaging-actions";
import { messagingChannelRegistry } from "@/lib/messaging/registry";
import { maskSecret } from "@/lib/secrets";
import type { StatusTone } from "@/lib/ui/status-tone";

export const dynamic = "force-dynamic";

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
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка каналов уведомлений" />}>
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

  return (
    <PageShell
      eyebrow="Администрирование"
      title="Каналы уведомлений"
      description="Исходящие уведомления в Slack, Microsoft Teams, Telegram и WhatsApp: готовность каналов, защитные проверки и очередь доставок."
      actions={
        <Link href="/admin" className="action-button">
          <ArrowLeft size={16} aria-hidden="true" />
          К настройкам
        </Link>
      }
    >
      <AdminFrame>
        <section className="ops-panel" aria-labelledby="channels-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Каналы действий</p>
              <h2 id="channels-title" className="ops-panel__title">Каналы сообщений</h2>
              <p className="ops-panel__subtitle">Рабочий контур для Slack, Teams, Telegram и WhatsApp: готовность, защитные проверки и очередь доставок.</p>
            </div>
            <StatusBadge label="Активны" value={activeActionChannels} tone={activeActionChannels > 0 ? "positive" : "neutral"} />
          </div>
          <section className="system-section-summary system-section-summary--four" aria-label="Сводка каналов действий">
            <StatCard label="Каналы" value={messagingChannels.length} hint="Настроены в workspace" tone={messagingChannels.length > 0 ? "info" : "neutral"} />
            <StatCard label="В очереди" value={queuedDeliveries} hint="Ожидают отправки" tone={queuedDeliveries > 0 ? "warning" : "positive"} />
            <StatCard label="Ошибки" value={failedDeliveries} hint="Требуют проверки" tone={failedDeliveries > 0 ? "negative" : "positive"} />
            <StatCard label="Доставлено" value={deliveredDeliveries} hint="За все время" tone={deliveredDeliveries > 0 ? "positive" : "neutral"} />
          </section>
          {failedDeliveries > 0 ? (
            <div className="system-attention system-attention--negative">
              <AlertTriangle size={17} aria-hidden="true" />
              <div>
                <p className="system-attention__title">Доставка уведомлений деградировала</p>
                <p className="system-attention__text">Проверьте последний error у канала и scope токена перед повторной отправкой.</p>
              </div>
            </div>
          ) : null}
          <div className="grid gap-5 p-5 pt-0 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
            <section aria-labelledby="channel-readiness-title">
              <h3 id="channel-readiness-title" className="mb-3 text-sm font-semibold uppercase text-[var(--text-muted)]">Настройка каналов</h3>
              <div className="record-list">
                {Object.values(messagingChannelRegistry).map((definition) => {
                  const channel = configuredChannelByKind.get(definition.kind);
                  const capabilities = channel ? parseCapabilities(channel.capabilities) : definition.capabilities;
                  const webhookUrl = parseWebhookUrl(channel?.configJson);
                  const maskedWebhook = maskSecret(webhookUrl);
                  const hasSecret = Boolean(channel?.secretRef);
                  const channelStatus = channel?.status ?? "draft";
                  const isActive = channelStatus === "active";

                  return (
                    <article key={definition.kind} className="record-card">
                      <div className="record-row">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Send size={16} aria-hidden="true" />
                            <h4 className="record-title">{channel?.displayName ?? definition.displayName}</h4>
                          </div>
                          <p className="record-meta mt-1">
                            {capabilities.map(messagingCapabilityLabel).join(", ")} ·{" "}
                            {definition.ingestRequiresConsent ? "прием сообщений выключен до согласия и правил хранения" : "только исходящие уведомления"}
                          </p>
                        </div>
                        <StatusBadge
                          label="Статус"
                          value={channel ? messagingChannelStatusLabel(channelStatus) : "Не настроен"}
                          tone={channel ? messagingChannelTone(channelStatus) : "neutral"}
                        />
                      </div>

                      <MessagingChannelForm
                        kind={definition.kind}
                        displayName={channel?.displayName ?? definition.displayName}
                        status={channelStatus}
                        maskedWebhook={maskedWebhook}
                        hasSecret={hasSecret}
                      />

                      <p className="record-meta tabular-nums">
                        Доставок: {channel?._count.deliveries ?? 0} · последняя: {formatDate(channel?.lastDeliveredAt)}
                      </p>
                      {channel?.lastError ? <p className="mt-2 text-sm font-medium text-[var(--danger)]">{channel.lastError}</p> : null}
                      <div className="messaging-channel-footer">
                        <a href={definition.docsHref} target="_blank" rel="noreferrer" className="quiet-link text-sm">
                          Документация канала
                        </a>
                        {channel ? (
                          <form action={setMessagingChannelStatus} className="messaging-channel-footer__toggle">
                            <input type="hidden" name="kind" value={definition.kind} />
                            <input type="hidden" name="status" value={isActive ? "draft" : "active"} />
                            <button type="submit" className="action-button action-button--small">
                              {isActive ? "В черновик" : "Активировать"}
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <section aria-labelledby="channel-deliveries-title">
              <h3 id="channel-deliveries-title" className="mb-3 text-sm font-semibold uppercase text-[var(--text-muted)]">Последние action notifications</h3>
              <div className="record-list">
                {recentDeliveries.length === 0 ? (
                  <EmptyState size="inline" icon={<Send size={20} aria-hidden="true" />} title="Доставок пока нет" description="Сообщения появятся здесь после первой отправки по каналам уведомлений." />
                ) : (
                  recentDeliveries.map((delivery) => (
                    <article key={delivery.id} className="record-card">
                      <div className="record-row">
                        <div className="min-w-0">
                          <h4 className="record-title">{delivery.title}</h4>
                          <p className="record-meta mt-1">
                            {delivery.channel?.displayName ?? delivery.kind} · {messagingEventTypeLabel(delivery.eventType)} · {messagingRecipientLabel(delivery.recipientType)}
                          </p>
                        </div>
                        <StatusBadge label="Статус" value={messagingDeliveryStatusLabel(delivery.status)} tone={messagingDeliveryTone(delivery.status)} />
                      </div>
                      <p className="record-meta">{delivery.body}</p>
                      <p className="record-meta tabular-nums">
                        Создано: {formatDate(delivery.createdAt)} · доставлено: {formatDate(delivery.deliveredAt)}
                      </p>
                      {delivery.error ? <p className="mt-2 text-sm font-medium text-[var(--danger)]">{delivery.error}</p> : null}
                      {delivery.href ? <Link href={delivery.href} className="quiet-link text-sm">Открыть действие</Link> : null}
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      </AdminFrame>
    </PageShell>
  );
}
