import type { ConnectStep } from "@/lib/integrations/connect/types";

export type ConnectNextAction = {
  label: string;
  description: string;
  severity: "info" | "warning" | "negative";
  action: "fix_auth" | "configure_webhook" | "run_live_certification" | "open_source";
};

export function nextActionForConnectSteps(steps: ConnectStep[]): ConnectNextAction {
  const failed = steps.find((step) => step.status === "failed");

  if (failed?.step === "verify_auth") {
    return {
      label: "Проверить доступы",
      description: "Источник не подтвердил учетные данные. Обновите токен или OAuth-настройки и повторите проверку.",
      severity: "negative",
      action: "fix_auth"
    };
  }

  if (failed?.step === "validate_url" || failed?.step === "reachability") {
    return {
      label: "Проверить адрес источника",
      description: "Stemma не смогла открыть источник. Проверьте URL, сетевой доступ и private-network настройки.",
      severity: "negative",
      action: "open_source"
    };
  }

  if (failed?.step === "webhook_probe") {
    return {
      label: "Настроить webhook",
      description: "Источник подключен, но webhook-проверка не прошла. Проверьте endpoint, секрет и события.",
      severity: "negative",
      action: "configure_webhook"
    };
  }

  const persistOk = steps.some((step) => step.step === "persist" && step.status === "ok");
  const webhookWarning = steps.find((step) => step.step === "webhook_probe" && step.status === "warning");
  const probesPassed = steps.some(
    (step) =>
      (step.step === "verify_auth" || step.step === "capability_probe") && step.status === "ok"
  );

  // Probe/persist success is not production-ready: push live certification next.
  if (persistOk || webhookWarning || probesPassed) {
    return {
      label: "Запустить живую сертификацию",
      description:
        "Базовое подключение готово после проверки. Зелёный production-ready — только после живой сертификации с evidence.",
      severity: "warning",
      action: "run_live_certification"
    };
  }

  return {
    label: "Открыть источник",
    description: "Проверьте импорт, диагностику и readiness evidence. Зелёный статус — только после живой сертификации.",
    severity: "info",
    action: "open_source"
  };
}
