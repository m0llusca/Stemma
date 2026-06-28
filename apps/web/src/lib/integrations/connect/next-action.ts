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

  const webhookWarning = steps.find((step) => step.step === "webhook_probe" && step.status === "warning");
  if (webhookWarning) {
    return {
      label: "Запустить живую сертификацию",
      description: "Базовое подключение готово. Для production-ready статуса нужен protected smoke-run с evidence.",
      severity: "warning",
      action: "run_live_certification"
    };
  }

  return {
    label: "Открыть источник",
    description: "Источник подключен. Проверьте импорт, диагностику и readiness evidence.",
    severity: "info",
    action: "open_source"
  };
}
