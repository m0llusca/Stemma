"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditLog } from "@/lib/audit";
import { upsertCustomConversation } from "@/lib/conversation-import";
import { assertCanPersistSettings, canManageIntegrations, getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { createOtrsHttpClient } from "@/lib/integrations/otrs-family/client";
import { parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import {
  detectOtrsRoutes,
  type OtrsRouteDetectionResult
} from "@/lib/integrations/otrs-family/route-detection";
import type { OtrsOperation } from "@/lib/integrations/otrs-family/requests";
import {
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  normalizeOtrsFamilyTicket,
  type OtrsFamilyNormalizeOptions,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";

const otrsFamilySources = ["otrs", "znuny", "otobo", "otrs_family"] as const satisfies readonly OtrsFamilySource[];

function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalStringField(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? value : undefined;
}

function sourceField(formData: FormData): OtrsFamilySource {
  const source = stringField(formData, "source") || "otrs_family";

  if (!otrsFamilySources.includes(source as OtrsFamilySource)) {
    throw new Error("Некорректный источник OTRS-family.");
  }

  return source as OtrsFamilySource;
}

function parseTicketGetPayload(rawPayload: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawPayload);
  } catch {
    throw new Error("TicketGet payload должен быть валидным JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("TicketGet payload должен быть JSON-объектом.");
  }

  const tickets = extractOtrsFamilyTickets(parsed as OtrsFamilyTicketGetResponse);

  if (tickets.length === 0 || tickets.some((ticket) => !isOtrsFamilyTicketLike(ticket))) {
    throw new Error("Не найден TicketGet-ответ с Ticket/TicketID/TicketNumber/Article.");
  }

  return tickets;
}

export async function importOtrsFamilyTicketGet(formData: FormData) {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    throw new Error("Нет прав на импорт из OTRS-family.");
  }

  await assertCanPersistSettings(user);

  const source = sourceField(formData);
  const rawPayload = stringField(formData, "payload");

  if (!rawPayload) {
    throw new Error("Вставьте TicketGet payload.");
  }

  const options: OtrsFamilyNormalizeOptions = {
    source,
    baseUrl: optionalStringField(formData, "baseUrl"),
    timeZone: optionalStringField(formData, "timeZone"),
    samplingReason: optionalStringField(formData, "samplingReason")
  };
  const conversations = parseTicketGetPayload(rawPayload).map((ticket) => normalizeOtrsFamilyTicket(ticket, options));

  const imported = await prisma.$transaction(async (tx) => {
    const rows = [];

    for (const conversation of conversations) {
      rows.push(await upsertCustomConversation(user.workspaceId, conversation, tx));
    }

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.otrs_family_imported",
        targetType: "integration",
        targetId: source,
        metadata: {
          source,
          count: rows.length,
          externalIds: rows.map((row) => row.externalId),
          baseUrl: options.baseUrl
        }
      },
      tx
    );

    return rows;
  });

  revalidatePath("/admin/integrations");
  revalidatePath("/reviews");
  redirect(`/reviews?source=${encodeURIComponent(source)}&q=${encodeURIComponent(imported[0]?.externalId ?? "")}`);
}

export type DetectOtrsRoutesState =
  | { ok: true; result: OtrsRouteDetectionResult }
  | { ok: false; message: string }
  | null;

const detectOperationEnum: Record<"ticketGet" | "ticketSearch" | "sessionCreate", OtrsOperation> = {
  ticketGet: "TicketGet",
  ticketSearch: "TicketSearch",
  sessionCreate: "SessionCreate"
};

export async function detectOtrsRoutesAction(
  _prev: DetectOtrsRoutesState,
  formData: FormData
): Promise<DetectOtrsRoutesState> {
  const user = await getCurrentUser();

  if (!canManageIntegrations(user.role)) {
    return { ok: false, message: "Недостаточно прав для определения маршрутов." };
  }

  const baseUrl = stringField(formData, "baseUrl");

  if (!baseUrl) {
    return { ok: false, message: "Укажите Base URL источника." };
  }

  const webServiceName = stringField(formData, "webServiceName") || "GenericTicketConnectorREST";
  const testTicketId = stringField(formData, "testTicketId") || "1";

  const config = parseOtrsConnectorConfig({ webServiceName });
  const client = createOtrsHttpClient({ config, baseUrl, userLogin: "", password: "" });

  try {
    const result = await detectOtrsRoutes({
      baseUrl,
      webServiceName,
      testTicketId,
      probeRoute: (request) =>
        client.probeRoute({
          operation: detectOperationEnum[request.operation as keyof typeof detectOperationEnum],
          method: request.method,
          url: request.url,
          headers:
            request.method === "POST"
              ? { accept: "application/json", "content-type": "application/json" }
              : { accept: "application/json" },
          body: request.method === "POST" ? {} : undefined,
          timeoutMs: config.limits.requestTimeoutMs,
          maxResponseBytes: config.limits.maxResponseBytes
        })
    });

    return { ok: true, result };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Не удалось определить маршруты." };
  }
}
