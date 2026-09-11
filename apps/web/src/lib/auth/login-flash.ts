import { authCookieOptions } from "@/lib/auth/cookies";

export const loginFlashCookieName = "qc_login_flash";

export type LoginFlashCode = "invalid_credentials" | "sso_unavailable" | "sso_start_failed" | "sso_callback_failed";

const loginFlashMessages: Record<LoginFlashCode, string> = {
  invalid_credentials: "Неверный логин или пароль.",
  sso_unavailable:
    "Единый вход недоступен: провайдер не настроен, отключён или не прошёл проверку конфигурации.",
  sso_start_failed:
    "Не удалось начать единый вход. Проверьте настройку провайдера и повторите попытку.",
  sso_callback_failed:
    "Единый вход не завершён: провайдер отклонил обмен или сессия не создана."
};

export function loginFlashCookieOptions(maxAge = 60) {
  return authCookieOptions(maxAge);
}

export function resolveLoginFlashMessage(value: string | undefined) {
  return value && value in loginFlashMessages ? loginFlashMessages[value as LoginFlashCode] : undefined;
}
