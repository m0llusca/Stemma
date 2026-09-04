import { createHelpdeskAdapter } from "@/lib/integrations/helpdesk-adapters/index";
import type {
  HelpdeskCapabilityProbeResult,
  PhaseBHelpdeskSource
} from "@/lib/integrations/helpdesk-adapters/types";
import type { CapabilityProbeResult, ConnectContext } from "@/lib/integrations/connect/types";

/**
 * Maps adapter-level capability diagnostics into the Connect orchestrator shape.
 * Probes are diagnostic only — they never imply live certification.
 */
export function mapHelpdeskProbeToConnect(result: HelpdeskCapabilityProbeResult): CapabilityProbeResult {
  return {
    status: result.status,
    detail: result.detail,
    hint: result.hint,
    diagnostics: {
      probeKind: "diagnostic",
      operations: result.operations,
      requestCount: result.diagnostics.requests.length
    }
  };
}

export async function runHelpdeskCapabilityProbe(input: {
  source: PhaseBHelpdeskSource;
  ctx: ConnectContext;
  token: string;
}): Promise<CapabilityProbeResult> {
  const adapter = createHelpdeskAdapter(input.source);

  if (!adapter.probeCapabilities) {
    return {
      status: "skipped",
      detail: "Для этого источника пока нет отдельной проверки возможностей."
    };
  }

  const externalId = input.ctx.testTicketId ?? input.ctx.hints?.testTicketId;

  try {
    const result = await adapter.probeCapabilities({
      source: input.source,
      baseUrl: input.ctx.baseUrl,
      token: input.token,
      ...(externalId ? { externalId } : {})
    });
    return mapHelpdeskProbeToConnect(result);
  } catch (error) {
    const hint =
      error && typeof error === "object" && "safeMessage" in error && typeof (error as { safeMessage: unknown }).safeMessage === "string"
        ? (error as { safeMessage: string }).safeMessage
        : "Повторите проверку с корректным тестовым ID и доступом к API.";

    return {
      status: "failed",
      detail: "Диагностика возможностей завершилась с ошибкой.",
      hint,
      diagnostics: { probeKind: "diagnostic" }
    };
  }
}
