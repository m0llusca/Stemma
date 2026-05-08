import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  applyCaBundleCredentialReference,
  preserveCaBundleCredentialReference,
  sanitizeIntegrationCredentialConfig,
  summarizeIntegrationSecretSlots,
  upsertIntegrationSecretSlot
} from "@/lib/integrations/otrs-family/credentials";

export const dynamic = "force-dynamic";

const integrationSchema = z.object({
  source: z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/),
  displayName: z.string().trim().min(2).max(160),
  type: z.string().trim().min(2).max(80).optional(),
  status: z.enum(["draft", "ready", "active", "disabled", "queued"]).optional(),
  baseUrl: z.string().trim().url().optional().or(z.literal("")),
  authMode: z.string().trim().min(2).max(80).optional(),
  importLimit: z.number().int().min(1).max(10000).optional(),
  batchSize: z.number().int().min(1).max(1000).optional(),
  dateRangeDays: z.number().int().min(1).max(365).optional(),
  schedule: z.string().trim().max(120).optional().or(z.literal("")),
  config: z.record(z.unknown()).optional(),
  credentialSecret: z.string().min(1).optional(),
  caBundle: z.string().min(1).optional()
});

function optionalString(value: string | undefined) {
  return value?.trim() || null;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}

export async function GET() {
  const user = await requireCurrentUserPermission("integrations:manage");
  const integrations = await prisma.integration.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ updatedAt: "desc" }],
    include: {
      credentials: {
        select: {
          id: true,
          kind: true,
          authMode: true,
          fingerprint: true,
          lastRotatedAt: true,
          createdAt: true,
          updatedAt: true
        }
      },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 5
      }
    }
  });

  return apiJson({
    integrations: integrations.map((integration) => {
      const credentialSummaries = summarizeIntegrationSecretSlots(integration.credentials);

      return {
        id: integration.id,
        source: integration.source,
        displayName: integration.displayName,
        type: integration.type,
        status: integration.status,
        baseUrl: integration.baseUrl,
        authMode: integration.authMode,
        importLimit: integration.importLimit,
        batchSize: integration.batchSize,
        dateRangeDays: integration.dateRangeDays,
        schedule: integration.schedule,
        syncCursor: integration.syncCursor,
        lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
        lastImportAt: integration.lastImportAt?.toISOString() ?? null,
        lastError: integration.lastError,
        config: sanitizeIntegrationCredentialConfig(parseJson(integration.configJson)),
        hasCredential: credentialSummaries.some((credential) => credential.kind === "auth_password"),
        hasCaBundle: credentialSummaries.some((credential) => credential.kind === "ca_bundle"),
        credentials: credentialSummaries,
        credential: credentialSummaries.find((credential) => credential.kind === "auth_password") ?? null,
        runs: integration.runs.map((run) => ({
          id: run.id,
          status: run.status,
          mode: run.mode,
          dryRun: run.dryRun,
          requestedLimit: run.requestedLimit,
          importedCount: run.importedCount,
          errorCount: run.errorCount,
          startedAt: run.startedAt.toISOString(),
          finishedAt: run.finishedAt?.toISOString() ?? null
        }))
      };
    })
  });
}

export async function POST(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  const user = session.user;
  const body = await request.json().catch(() => null);
  const parsed = integrationSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Некорректные параметры интеграции.", 400, requestId, parsed.error.flatten());
  }

  const sanitizedConfig = sanitizeIntegrationCredentialConfig(parsed.data.config ?? {});

  const saved = await prisma.$transaction(async (tx) => {
    const existing = await tx.integration.findUnique({
      where: {
        workspaceId_source: {
          workspaceId: user.workspaceId,
          source: parsed.data.source
        }
      },
      select: {
        configJson: true,
        credentials: {
          select: {
            id: true,
            kind: true,
            fingerprint: true
          }
        }
      }
    });
    const existingCaBundleSlot = existing?.credentials.find((credential) => credential.kind === "ca_bundle");
    const configForWrite =
      !parsed.data.caBundle && existingCaBundleSlot
        ? preserveCaBundleCredentialReference(sanitizedConfig, parseJson(existing?.configJson ?? "{}"), existingCaBundleSlot)
        : sanitizedConfig;

    const result = await tx.integration.upsert({
      where: {
        workspaceId_source: {
          workspaceId: user.workspaceId,
          source: parsed.data.source
        }
      },
      create: {
        workspaceId: user.workspaceId,
        source: parsed.data.source,
        displayName: parsed.data.displayName,
        type: parsed.data.type ?? "custom_api",
        status: parsed.data.status ?? "ready",
        baseUrl: optionalString(parsed.data.baseUrl),
        authMode: parsed.data.authMode ?? "token",
        importLimit: parsed.data.importLimit ?? 100,
        batchSize: parsed.data.batchSize ?? 25,
        dateRangeDays: parsed.data.dateRangeDays ?? 30,
        schedule: optionalString(parsed.data.schedule),
        configJson: JSON.stringify(configForWrite)
      },
      update: {
        displayName: parsed.data.displayName,
        type: parsed.data.type ?? "custom_api",
        status: parsed.data.status ?? "ready",
        baseUrl: optionalString(parsed.data.baseUrl),
        authMode: parsed.data.authMode ?? "token",
        importLimit: parsed.data.importLimit ?? 100,
        batchSize: parsed.data.batchSize ?? 25,
        dateRangeDays: parsed.data.dateRangeDays ?? 30,
        schedule: optionalString(parsed.data.schedule),
        configJson: JSON.stringify(configForWrite),
        lastError: null
      }
    });

    if (parsed.data.credentialSecret) {
      await upsertIntegrationSecretSlot(tx, {
        workspaceId: user.workspaceId,
        integrationId: result.id,
        kind: "auth_password",
        authMode: parsed.data.authMode ?? result.authMode,
        secret: parsed.data.credentialSecret
      });
    }

    if (parsed.data.caBundle) {
      const caBundleSlot = await upsertIntegrationSecretSlot(tx, {
        workspaceId: user.workspaceId,
        integrationId: result.id,
        kind: "ca_bundle",
        authMode: "tls_ca_bundle",
        secret: parsed.data.caBundle
      });

      await tx.integration.update({
        where: { id: result.id },
        data: {
          configJson: JSON.stringify(applyCaBundleCredentialReference(sanitizedConfig, caBundleSlot))
        }
      });
    }

    await auditLog(
      {
        workspaceId: user.workspaceId,
        actorId: user.id,
        action: "integration.upserted",
        targetType: "integration",
        targetId: result.id,
        metadata: {
          source: result.source,
          type: result.type,
          status: result.status,
          hasCredential: Boolean(parsed.data.credentialSecret)
        }
      },
      tx
    );

    const credentialSummaries = summarizeIntegrationSecretSlots(
      await tx.integrationCredential.findMany({
        where: {
          workspaceId: user.workspaceId,
          integrationId: result.id
        },
        orderBy: [{ kind: "asc" }]
      })
    );

    return {
      integration: result,
      credentialSummaries
    };
  });

  return apiJson(
    {
      integration: {
        id: saved.integration.id,
        source: saved.integration.source,
        displayName: saved.integration.displayName,
        status: saved.integration.status,
        hasCredential: saved.credentialSummaries.some((credential) => credential.kind === "auth_password"),
        hasCaBundle: saved.credentialSummaries.some((credential) => credential.kind === "ca_bundle")
      }
    },
    201,
    requestId
  );
}
