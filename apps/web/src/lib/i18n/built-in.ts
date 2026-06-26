import { fullTranslationKey, translationKeySeeds } from "./keys";

export const builtInDefaultLocale = "ru";

export type BuiltInLocale = "en" | typeof builtInDefaultLocale;
export type TranslationEntries = Record<string, string>;

export const builtInDictionaries: Record<BuiltInLocale, TranslationEntries> = {
  ru: Object.fromEntries(
    translationKeySeeds.map((seed) => [fullTranslationKey(seed), seed.defaultText])
  ),
  en: Object.fromEntries(translationKeySeeds.map((seed) => [fullTranslationKey(seed), seed.en]))
};
