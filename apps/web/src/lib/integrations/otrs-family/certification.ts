import {
  appendCertificationStep,
  createCertificationRun,
  finalizeCertificationRun,
  type CertificationRunView,
  type CertificationStepStatus
} from "@/lib/certification/runs";

export type OtrsCertificationDiagnostics = {
  routeDetected: boolean;
  authOk: boolean;
  ticketSearchOk: boolean;
  webhookOk: boolean;
};

export type OtrsCertificationSampleImport = {
  imported: number;
  skipped: number;
};

export type CertificationStepDraft = {
  stepKey: string;
  position: number;
  status: CertificationStepStatus;
  detail: string;
  hint?: string;
  diagnostics?: Record<string, unknown>;
};

export type OtrsCertificationInput = {
  source: "otrs" | "znuny" | "otobo";
  diagnostics: OtrsCertificationDiagnostics;
  sampleImport: OtrsCertificationSampleImport;
};

export type OtrsCertificationRunInput = OtrsCertificationInput & {
  workspaceId: string;
  integrationId: string;
  actorId: string;
};

export function buildOtrsCertificationSteps(input: OtrsCertificationInput): CertificationStepDraft[] {
  const sourceLabel = input.source === "otrs" ? "OTRS" : input.source === "znuny" ? "Znuny" : "OTOBO";

  return [
    {
      stepKey: "contract_check",
      position: 1,
      status: input.diagnostics.routeDetected ? "passed" : "blocked",
      detail: input.diagnostics.routeDetected ? `${sourceLabel}: контракт адаптера найден.` : `${sourceLabel}: маршрут не подтвержден.`,
      hint: input.diagnostics.routeDetected ? undefined : `Проверьте GenericInterface web service для ${sourceLabel}.`
    },
    {
      stepKey: "auth_check",
      position: 2,
      status: input.diagnostics.authOk ? "passed" : "failed",
      detail: input.diagnostics.authOk ? "Авторизация подтверждена." : "Источник не подтвердил учетные данные.",
      hint: input.diagnostics.authOk ? undefined : "Проверьте пользователя, пароль и GenericInterface web service."
    },
    {
      stepKey: "capability_check",
      position: 3,
      status: input.diagnostics.ticketSearchOk ? "passed" : "failed",
      detail: input.diagnostics.ticketSearchOk ? "TicketSearch доступен." : "TicketSearch недоступен.",
      hint: input.diagnostics.ticketSearchOk ? undefined : `Проверьте маршруты GenericInterface для ${sourceLabel}.`
    },
    {
      stepKey: "sample_import",
      position: 4,
      status: input.sampleImport.imported > 0 ? "passed" : "blocked",
      detail: `Импортировано ${input.sampleImport.imported}, пропущено ${input.sampleImport.skipped}.`,
      hint: input.sampleImport.imported > 0 ? undefined : "Укажите тестовый TicketID и повторите импорт."
    },
    {
      stepKey: "webhook_or_polling_check",
      position: 5,
      status: input.diagnostics.webhookOk ? "passed" : "blocked",
      detail: input.diagnostics.webhookOk ? "Webhook подтвержден." : "Webhook или polling fallback не подтвержден.",
      hint: input.diagnostics.webhookOk ? undefined : `Настройте webhook или подтвердите polling fallback для ${sourceLabel}.`
    },
    {
      stepKey: "evidence_lock",
      position: 6,
      status: "passed",
      detail: "Диагностика подготовлена для evidence ledger."
    }
  ];
}

export async function recordOtrsCertificationRun(input: OtrsCertificationRunInput): Promise<CertificationRunView> {
  const run = await createCertificationRun({
    workspaceId: input.workspaceId,
    targetType: "integration",
    source: input.source,
    integrationId: input.integrationId,
    actorId: input.actorId
  });
  const steps = buildOtrsCertificationSteps(input);

  for (const step of steps) {
    await appendCertificationStep({
      workspaceId: input.workspaceId,
      runId: run.id,
      ...step,
      finishedAt: new Date()
    });
  }

  const hasFailure = steps.some((step) => step.status === "failed");
  const hasBlocker = steps.some((step) => step.status === "blocked");
  return finalizeCertificationRun({
    workspaceId: input.workspaceId,
    runId: run.id,
    status: hasFailure ? "failed" : hasBlocker ? "blocked" : "passed",
    summary: {
      imported: input.sampleImport.imported,
      skipped: input.sampleImport.skipped,
      source: input.source
    }
  });
}
