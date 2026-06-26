export type TranslationNamespace = "auth" | "dashboard" | "integrations" | "shell";

export type TranslationKeySeed = {
  namespace: TranslationNamespace;
  key: string;
  defaultText: string;
  description?: string;
  ownerArea: string;
  en: string;
};

export function fullTranslationKey(seed: Pick<TranslationKeySeed, "namespace" | "key">): string {
  return `${seed.namespace}.${seed.key}`;
}

export const translationKeySeeds = [
  {
    namespace: "shell",
    key: "nav.dashboard",
    defaultText: "Дашборд",
    ownerArea: "shell",
    en: "Dashboard"
  },
  {
    namespace: "shell",
    key: "nav.reviews",
    defaultText: "Проверки",
    ownerArea: "shell",
    en: "Reviews"
  },
  {
    namespace: "auth",
    key: "login.title",
    defaultText: "Вход в систему",
    ownerArea: "auth",
    en: "Sign in"
  },
  {
    namespace: "dashboard",
    key: "title",
    defaultText: "Дашборд качества",
    ownerArea: "dashboard",
    en: "Quality dashboard"
  },
  {
    namespace: "dashboard",
    key: "focus.title",
    defaultText: "Фокус сейчас",
    ownerArea: "dashboard",
    en: "Focus now"
  },
  {
    namespace: "integrations",
    key: "sources.connected.title",
    defaultText: "Подключенные источники",
    ownerArea: "integrations",
    en: "Connected sources"
  }
] satisfies TranslationKeySeed[];
