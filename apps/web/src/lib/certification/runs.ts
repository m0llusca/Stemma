import { redactCertificationDiagnostics } from "@/lib/certification/readiness-report";
import { prisma } from "@/lib/db";

export type CertificationRunStatus = "running" | "passed" | "failed" | "blocked";
export type CertificationStepStatus = "pending" | "passed" | "failed" | "blocked" | "skipped";

export type CreateCertificationRunInput = {
  workspaceId: string;
  targetType: string;
  source: string;
  provider?: string | null;
  integrationId?: string | null;
  identityProviderId?: string | null;
  actorId?: string | null;
  nextAction?: unknown;
  summary?: unknown;
};

export type AppendCertificationStepInput = {
  workspaceId: string;
  runId: string;
  stepKey: string;
  position: number;
  status?: CertificationStepStatus;
  detail?: string | null;
  hint?: string | null;
  diagnostics?: unknown;
  startedAt?: Date;
  finishedAt?: Date | null;
};

export type FinalizeCertificationRunInput = {
  workspaceId: string;
  runId: string;
  status: Exclude<CertificationRunStatus, "running">;
  nextAction?: unknown;
  summary?: unknown;
  finishedAt?: Date;
};

export type CertificationRunView = {
  id: string;
  workspaceId: string;
  targetType: string;
  source: string;
  provider: string | null;
  integrationId: string | null;
  identityProviderId: string | null;
  actorId: string | null;
  status: CertificationRunStatus;
  startedAt: string;
  finishedAt: string | null;
  nextAction: Record<string, unknown>;
  summary: Record<string, unknown>;
};

export type CertificationStepView = {
  id: string;
  workspaceId: string;
  runId: string;
  stepKey: string;
  position: number;
  status: CertificationStepStatus;
  detail: string | null;
  hint: string | null;
  diagnostics: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
};

type CertificationRunRow = {
  id: string;
  workspaceId: string;
  targetType: string;
  source: string;
  provider: string | null;
  integrationId: string | null;
  identityProviderId: string | null;
  actorId: string | null;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
  nextActionJson: string;
  summaryJson: string;
};

type CertificationStepRow = {
  id: string;
  workspaceId: string;
  runId: string;
  stepKey: string;
  position: number;
  status: string;
  detail: string | null;
  hint: string | null;
  diagnosticsJson: string;
  startedAt: Date;
  finishedAt: Date | null;
};

function parseJsonObject(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isoDate(value: Date) {
  return value.toISOString();
}

function nullableIsoDate(value: Date | null) {
  return value ? isoDate(value) : null;
}

function normalizeRunStatus(status: string): CertificationRunStatus {
  return status === "running" || status === "passed" || status === "failed" || status === "blocked" ? status : "blocked";
}

function normalizeStepStatus(status: string): CertificationStepStatus {
  return status === "pending" || status === "passed" || status === "failed" || status === "blocked" || status === "skipped"
    ? status
    : "blocked";
}

function serializedJson(value: unknown) {
  return JSON.stringify(redactCertificationDiagnostics(value ?? {}));
}

function redactUrlText(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => {
    try {
      const url = new URL(candidate);
      url.username = url.username ? "[redacted]" : "";
      url.password = url.password ? "[redacted]" : "";
      if (url.search) {
        url.search = "?redacted=1";
      }
      return url.toString();
    } catch {
      return candidate;
    }
  });
}

function redactSecretText(value: string) {
  return value.replace(
    /\b(authorization|cookie|password|passwd|secret|token|api[_-]?key|client[_-]?secret|credential)\b(\s*[:=]\s*|\s+)([^\s"'<>]+)/gi,
    "$1$2[redacted]"
  );
}

function redactedText(value: string | null | undefined) {
  if (value == null) {
    return null;
  }

  const diagnosticsRedacted = redactCertificationDiagnostics({ text: value }).text;
  const normalized = typeof diagnosticsRedacted === "string" ? diagnosticsRedacted : value;
  return redactSecretText(redactUrlText(normalized).replace(/\b(Bearer|Basic)\s+[^\s"'<>]+/gi, "$1 [redacted]"));
}

async function assertWorkspaceReferences(input: Pick<CreateCertificationRunInput, "workspaceId" | "integrationId" | "identityProviderId" | "actorId">) {
  const checks: Array<Promise<unknown>> = [];

  if (input.integrationId) {
    checks.push(
      prisma.integration
        .findFirst({
          where: {
            id: input.integrationId,
            workspaceId: input.workspaceId
          },
          select: { id: true }
        })
        .then((integration) => {
          if (!integration) {
            throw new Error(`Integration ${input.integrationId} does not belong to workspace ${input.workspaceId}.`);
          }
        })
    );
  }

  if (input.identityProviderId) {
    checks.push(
      prisma.identityProvider
        .findFirst({
          where: {
            id: input.identityProviderId,
            workspaceId: input.workspaceId
          },
          select: { id: true }
        })
        .then((provider) => {
          if (!provider) {
            throw new Error(`Identity provider ${input.identityProviderId} does not belong to workspace ${input.workspaceId}.`);
          }
        })
    );
  }

  if (input.actorId) {
    checks.push(
      prisma.user
        .findFirst({
          where: {
            id: input.actorId,
            workspaceId: input.workspaceId
          },
          select: { id: true }
        })
        .then((actor) => {
          if (!actor) {
            throw new Error(`Actor ${input.actorId} does not belong to workspace ${input.workspaceId}.`);
          }
        })
    );
  }

  await Promise.all(checks);
}

function runView(row: CertificationRunRow): CertificationRunView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    targetType: row.targetType,
    source: row.source,
    provider: row.provider,
    integrationId: row.integrationId,
    identityProviderId: row.identityProviderId,
    actorId: row.actorId,
    status: normalizeRunStatus(row.status),
    startedAt: isoDate(row.startedAt),
    finishedAt: nullableIsoDate(row.finishedAt),
    nextAction: parseJsonObject(row.nextActionJson),
    summary: parseJsonObject(row.summaryJson)
  };
}

function stepView(row: CertificationStepRow): CertificationStepView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    runId: row.runId,
    stepKey: row.stepKey,
    position: row.position,
    status: normalizeStepStatus(row.status),
    detail: row.detail,
    hint: row.hint,
    diagnostics: parseJsonObject(row.diagnosticsJson),
    startedAt: isoDate(row.startedAt),
    finishedAt: nullableIsoDate(row.finishedAt)
  };
}

export async function createCertificationRun(input: CreateCertificationRunInput): Promise<CertificationRunView> {
  await assertWorkspaceReferences(input);

  const row = (await prisma.certificationRun.create({
    data: {
      workspaceId: input.workspaceId,
      targetType: input.targetType,
      source: input.source,
      provider: input.provider ?? null,
      integrationId: input.integrationId ?? null,
      identityProviderId: input.identityProviderId ?? null,
      actorId: input.actorId ?? null,
      status: "running",
      nextActionJson: serializedJson(input.nextAction),
      summaryJson: serializedJson(input.summary)
    }
  })) as CertificationRunRow;

  return runView(row);
}

export async function appendCertificationStep(input: AppendCertificationStepInput): Promise<CertificationStepView> {
  const row = (await prisma.certificationRunStep.create({
    data: {
      workspaceId: input.workspaceId,
      runId: input.runId,
      stepKey: input.stepKey,
      position: input.position,
      status: input.status ?? "pending",
      detail: redactedText(input.detail),
      hint: redactedText(input.hint),
      diagnosticsJson: serializedJson(input.diagnostics),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {})
    }
  })) as CertificationStepRow;

  return stepView(row);
}

export async function finalizeCertificationRun(input: FinalizeCertificationRunInput): Promise<CertificationRunView> {
  const row = (await prisma.certificationRun.update({
    where: { id_workspaceId: { id: input.runId, workspaceId: input.workspaceId } },
    data: {
      status: input.status,
      finishedAt: input.finishedAt ?? new Date(),
      ...(input.nextAction !== undefined ? { nextActionJson: serializedJson(input.nextAction) } : {}),
      ...(input.summary !== undefined ? { summaryJson: serializedJson(input.summary) } : {})
    }
  })) as CertificationRunRow;

  return runView(row);
}
