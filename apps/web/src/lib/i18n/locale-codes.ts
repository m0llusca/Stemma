const localeCodePattern = /^[A-Za-z]{2,3}(?:-[A-Za-z]{2}|\-[0-9]{3})?$/;

export function normalizeLocaleCode(value: string): string {
  const rawCode = value.trim();

  if (!localeCodePattern.test(rawCode)) {
    throw new Error("Некорректный код языка.");
  }

  const [language, region] = rawCode.split("-");
  const normalizedLanguage = language.toLowerCase();

  if (!region) {
    return normalizedLanguage;
  }

  const normalizedRegion = /^\d+$/.test(region) ? region : region.toUpperCase();
  return `${normalizedLanguage}-${normalizedRegion}`;
}
