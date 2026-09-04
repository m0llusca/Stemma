import { authCookieOptions } from "@/lib/auth/cookies";

export const loginFlashCookieName = "qc_login_flash";

export type LoginFlashCode = "invalid_credentials" | "sso_unavailable" | "sso_start_failed" | "sso_callback_failed";

const loginFlashMessages: Record<LoginFlashCode, string> = {
  invalid_credentials: "Неверный логин или пароль.",
  sso_unavailable:
    "SSO недоступен: провайдер не настроен, отключён или не прошёл проверку конфигурации. Вход fail-closed.",
  sso_start_failed:
    "Не удалось начать SSO-вход. Конфигурация не подтверждена — повторите после проверки IdP (fail-closed).",
  sso_callback_failed:
    "SSO-вход не завершён: IdP отклонил обмен или сессия не создана. Это не успешный вход."
};

export function loginFlashCookieOptions(maxAge = 60) {
  return authCookieOptions(maxAge);
}

export function resolveLoginFlashMessage(value: string | undefined) {
  return value && value in loginFlashMessages ? loginFlashMessages[value as LoginFlashCode] : undefined;
}
