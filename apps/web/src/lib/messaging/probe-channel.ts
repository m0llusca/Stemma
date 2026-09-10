import { assertPublicBaseUrl, guardedFetch } from "@/lib/net-guard";

/**
 * Pre-activate reachability probe for outgoing notification webhooks.
 * Fail-closed: WhatsApp (unsupported) and network/SSRF failures do not count
 * as a successful probe — callers must not persist `active` without ok:true.
 */
export async function probeMessagingChannelWebhook(input: {
  kind: string;
  webhookUrl: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (input.kind === "whatsapp") {
    return {
      ok: false,
      error: "Доставка в WhatsApp пока не поддерживается — включение заблокировано до поддержки."
    };
  }

  const webhookUrl = input.webhookUrl.trim();
  if (!webhookUrl) {
    return { ok: false, error: "Укажите webhook URL для probe перед включением." };
  }

  let parsed: URL;
  try {
    parsed = new URL(webhookUrl);
  } catch {
    return { ok: false, error: "Webhook URL должен быть корректной ссылкой https://." };
  }

  try {
    await assertPublicBaseUrl(parsed);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Webhook URL недопустим для probe."
    };
  }

  try {
    // Any HTTP response (including 4xx/405) means the endpoint is reachable.
    // Network/DNS/timeout failures are fail-closed.
    await guardedFetch(parsed, {
      method: "GET",
      signal: AbortSignal.timeout(8_000)
    });
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "Probe не прошёл: webhook недоступен. Включение отменено."
    };
  }
}
