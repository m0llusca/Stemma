import { describe, expect, it } from "vitest";
import { nextActionForConnectSteps } from "@/lib/integrations/connect/next-action";
import type { ConnectStep } from "@/lib/integrations/connect/types";

describe("connect next action", () => {
  it("routes failed auth to credential repair", () => {
    const steps: ConnectStep[] = [
      { step: "validate_url", status: "ok" },
      { step: "verify_auth", status: "failed", detail: "401" }
    ];

    expect(nextActionForConnectSteps(steps)).toEqual({
      label: "Проверить доступы",
      description: "Источник не подтвердил учетные данные. Обновите токен или OAuth-настройки и повторите проверку.",
      severity: "negative",
      action: "fix_auth"
    });
  });

  it("routes successful token setup without webhook to live certification", () => {
    const steps: ConnectStep[] = [
      { step: "validate_url", status: "ok" },
      { step: "verify_auth", status: "ok" },
      { step: "capability_probe", status: "ok" },
      { step: "webhook_probe", status: "warning" },
      { step: "certification_evidence", status: "ok" }
    ];

    expect(nextActionForConnectSteps(steps)).toEqual({
      label: "Запустить живую сертификацию",
      description: "Базовое подключение готово. Для production-ready статуса нужен protected smoke-run с evidence.",
      severity: "warning",
      action: "run_live_certification"
    });
  });
});
