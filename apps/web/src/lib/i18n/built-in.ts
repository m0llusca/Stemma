import { baseLocaleCode, normalizeLocaleCode } from "./locale-codes";
import { fullTranslationKey, translationKeySeeds } from "./keys";

export const builtInDefaultLocale = "ru";

export type BuiltInLocale = "en" | typeof builtInDefaultLocale;
export type TranslationEntries = Record<string, string>;

export const builtInDictionaries = {
  ru: Object.fromEntries(
    translationKeySeeds.map((seed) => [fullTranslationKey(seed), seed.defaultText])
  ),
  en: Object.fromEntries(translationKeySeeds.map((seed) => [fullTranslationKey(seed), seed.en]))
} satisfies Record<BuiltInLocale, TranslationEntries>;

export function getBuiltInEntries(localeCode: string): TranslationEntries {
  const normalizedLocaleCode = normalizeLocaleCode(localeCode);
  const baseLanguage = baseLocaleCode(normalizedLocaleCode);
  return (
    builtInDictionaries[normalizedLocaleCode as BuiltInLocale] ??
    builtInDictionaries[baseLanguage as BuiltInLocale] ??
    builtInDictionaries[builtInDefaultLocale]
  );
}
