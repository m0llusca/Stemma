import { assertPublicBaseUrl, guardedFetch } from "@/lib/net-guard";

/**
 * Pre-activate reachability probe for outgoing notification webhooks.
 * Fail-closed: WhatsApp (unsupported), non-2xx HTTP, and network/SSRF failures
 * do not count as a successful probe — callers must not persist `active`
 * without ok:true.
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
    // Only 2xx counts as a successful probe. 4xx/5xx mean the endpoint answered
    // but is not a healthy webhook target — fail closed (no false-green activate).
    // Network/DNS/timeout/SSRF failures also fail closed.
    const response = await guardedFetch(parsed, {
      method: "GET",
      signal: AbortSignal.timeout(8_000)
    });
    if (response.status >= 200 && response.status < 300) {
      return { ok: true };
    }
    return {
      ok: false,
      error: `Probe не прошёл: webhook ответил HTTP ${response.status}. Включение отменено.`
    };
  } catch {
    return {
      ok: false,
      error: "Probe не прошёл: webhook недоступен. Включение отменено."
    };
  }
}
