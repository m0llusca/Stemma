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
      detail: input.detail ?? null,
      hint: input.hint ?? null,
      diagnosticsJson: serializedJson(input.diagnostics),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.finishedAt !== undefined ? { finishedAt: input.finishedAt } : {})
    }
  })) as CertificationStepRow;

  return stepView(row);
}

export async function finalizeCertificationRun(input: FinalizeCertificationRunInput): Promise<CertificationRunView> {
  const row = (await prisma.certificationRun.update({
    where: { id: input.runId },
    data: {
      status: input.status,
      finishedAt: input.finishedAt ?? new Date(),
      ...(input.nextAction !== undefined ? { nextActionJson: serializedJson(input.nextAction) } : {}),
      ...(input.summary !== undefined ? { summaryJson: serializedJson(input.summary) } : {})
    }
  })) as CertificationRunRow;

  return runView(row);
}
