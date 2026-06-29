import { decryptSecret } from "@/lib/secrets";
import {
  createMessagingHttpClient,
  defaultMessagingMaxResponseBytes,
  defaultMessagingTimeoutMs,
  type MessagingTransport,
  type MessagingWebhookResult
} from "@/lib/messaging/http";
import type { MessagingMessageContext } from "@/lib/messaging/job-contract";
import type { MessagingChannelKind } from "@/lib/messaging/types";

/**
 * Per-kind webhook delivery for a configured MessagingChannel.
 *
 * The channel stores its webhook target in `configJson` as
 * `JSON.stringify({ webhookUrl })` and, when a credential is needed, an
 * encrypted token in `secretRef` (decrypted here at send time). `sendToChannel`
 * builds the provider-specific request body, POSTs it via the injectable
 * transport, and returns `{ ok }`/`{ ok, error }` — it never throws on a normal
 * delivery failure, so the worker can record the outcome against the row.
 */

/** The minimal shape `sendToChannel` reads off a MessagingChannel row. */
export type SendableChannel = {
  kind: string;
  configJson: string;
  secretRef: string | null;
};

export type SendToChannelResult = {
  ok: boolean;
  error?: string;
  /** Set for WhatsApp (and any future provider we cannot deliver to yet). */
  unsupported?: boolean;
  statusCode?: number;
  diagnostic?: unknown;
};

export type SendToChannelOptions = {
  transport?: MessagingTransport;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

type ChannelConfig = {
  webhookUrl?: unknown;
  chatId?: unknown;
  chat_id?: unknown;
};

/**
 * Builds the provider body + headers for a channel kind. Returns null when the
 * kind cannot be delivered to (WhatsApp stub) so the caller reports a typed
 * "unsupported" result instead of POSTing.
 */
function buildRequest(
  kind: MessagingChannelKind,
  config: ChannelConfig,
  context: MessagingMessageContext,
  token: string | null
): { headers: Record<string, string>; body: string } | null {
  const text = composeText(context);

  if (kind === "slack") {
    return {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    };
  }

  if (kind === "teams") {
    // A simple MessageCard renders in Teams incoming webhooks; `text` is the
    // documented fallback for plain connectors.
    return {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "https://schema.org/extensions",
        summary: context.title,
        text
      })
    };
  }

  if (kind === "telegram") {
    // The configured webhookUrl is treated as the full Telegram send URL
    // (e.g. https://api.telegram.org/bot<token>/sendMessage). A chat_id, when
    // required, is read from config (or, if stored as a credential, secretRef).
    const chatId = firstString(config.chatId, config.chat_id, token);
    const body: Record<string, unknown> = { text };
    if (chatId) {
      body.chat_id = chatId;
    }
    return {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    };
  }

  // whatsapp -> not yet supported; documented stub, no crash.
  return null;
}

/** Composes the human-facing text body shared by text-based providers. */
function composeText(context: MessagingMessageContext): string {
  const lines = [context.title, context.body];
  if (context.href) {
    lines.push(context.href);
  }
  return lines.filter((line) => typeof line === "string" && line.length > 0).join("\n");
}

function firstString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }
  return null;
}

function parseConfig(configJson: string): ChannelConfig {
  try {
    const parsed = JSON.parse(configJson);
    return parsed && typeof parsed === "object" ? (parsed as ChannelConfig) : {};
  } catch {
    return {};
  }
}

function isMessagingKind(kind: string): kind is MessagingChannelKind {
  return kind === "slack" || kind === "teams" || kind === "telegram" || kind === "whatsapp";
}

export async function sendToChannel(
  channel: SendableChannel,
  context: MessagingMessageContext,
  options: SendToChannelOptions = {}
): Promise<SendToChannelResult> {
  if (!isMessagingKind(channel.kind)) {
    return { ok: false, error: `Канал «${channel.kind}» не поддерживается.`, unsupported: true };
  }

  if (channel.kind === "whatsapp") {
    return { ok: false, error: "Доставка в WhatsApp пока не поддерживается.", unsupported: true };
  }

  const config = parseConfig(channel.configJson);
  const webhookUrl = typeof config.webhookUrl === "string" ? config.webhookUrl.trim() : "";

  if (!webhookUrl) {
    return { ok: false, error: "В канале не настроен webhookUrl." };
  }

  let token: string | null = null;
  if (channel.secretRef) {
    try {
      token = decryptSecret(channel.secretRef);
    } catch {
      return { ok: false, error: "Не удалось расшифровать учетные данные канала." };
    }
  }

  const built = buildRequest(channel.kind, config, context, token);
  if (!built) {
    return { ok: false, error: `Доставка в канал «${channel.kind}» пока не поддерживается.`, unsupported: true };
  }

  const headers = { ...built.headers };
  // Slack/Teams incoming webhooks carry their auth in the URL; a configured
  // bearer token (when present) is attached for providers that expect a header.
  if (token && channel.kind !== "telegram") {
    headers.authorization = `Bearer ${token}`;
  }

  const client = createMessagingHttpClient({ transport: options.transport });
  const result: MessagingWebhookResult = await client.postWebhook({
    method: "POST",
    url: webhookUrl,
    headers,
    body: built.body,
    timeoutMs: options.timeoutMs ?? defaultMessagingTimeoutMs,
    maxResponseBytes: options.maxResponseBytes ?? defaultMessagingMaxResponseBytes
  });

  if (result.ok) {
    return { ok: true, statusCode: result.statusCode };
  }

  return { ok: false, error: result.error, statusCode: result.statusCode, diagnostic: result.diagnostic };
}
