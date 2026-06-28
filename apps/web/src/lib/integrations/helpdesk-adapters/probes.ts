import type {
  HelpdeskAdapterLoadInput,
  HelpdeskAdapterLoadResult,
  HelpdeskAdapterOperation,
  HelpdeskCapabilityProbeResult
} from "@/lib/integrations/helpdesk-adapters/types";

export function capabilityProbeFromLoadResult(
  input: Pick<HelpdeskAdapterLoadInput, "source">,
  result: HelpdeskAdapterLoadResult,
  requiredOperations: readonly HelpdeskAdapterOperation[]
): HelpdeskCapabilityProbeResult {
  const observed = result.diagnostics.requests.map((request) => request.operation);
  const missing = requiredOperations.filter((operation) => !observed.includes(operation));

  if (missing.length > 0) {
    return {
      status: "warning",
      operations: observed,
      detail: `${input.source}: часть операций не подтверждена.`,
      hint: `Не подтверждены операции: ${missing.join(", ")}.`,
      diagnostics: result.diagnostics
    };
  }

  return {
    status: "ok",
    operations: observed,
    detail: `${input.source}: чтение источника подтверждено.`,
    diagnostics: result.diagnostics
  };
}
