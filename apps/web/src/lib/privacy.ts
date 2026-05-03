export const redactedText = "[персональные данные удалены]";

export function redactText(value: string | null | undefined) {
  if (!value) {
    return value ?? "";
  }

  return redactedText;
}

export function redactMetadata(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactMetadata(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        const normalizedKey = key.toLowerCase();

        if (
          normalizedKey.includes("email") ||
          normalizedKey.includes("phone") ||
          normalizedKey.includes("customer") ||
          normalizedKey.includes("name") ||
          normalizedKey.includes("body") ||
          normalizedKey.includes("message")
        ) {
          return [key, redactedText];
        }

        return [key, redactMetadata(item)];
      })
    );
  }

  return value;
}

