const localeCodePattern =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4}(?:-(?:[A-Za-z]{2}|[0-9]{3}))?|-(?:[A-Za-z]{2}|[0-9]{3}))?$/;

export function normalizeLocaleCode(value: string): string {
  const rawCode = value.trim();

  if (!localeCodePattern.test(rawCode)) {
    throw new Error("Некорректный код языка.");
  }

  const parts = rawCode.split("-");
  const normalizedParts = [parts[0].toLowerCase()];

  for (const subtag of parts.slice(1)) {
    if (/^[A-Za-z]{4}$/.test(subtag)) {
      normalizedParts.push(`${subtag[0].toUpperCase()}${subtag.slice(1).toLowerCase()}`);
    } else if (/^[A-Za-z]{2}$/.test(subtag)) {
      normalizedParts.push(subtag.toUpperCase());
    } else {
      normalizedParts.push(subtag);
    }
  }

  return normalizedParts.join("-");
}

export function baseLocaleCode(value: string): string {
  return normalizeLocaleCode(value).split("-")[0];
}
