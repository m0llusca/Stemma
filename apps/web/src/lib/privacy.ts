export const redactedText = "[персональные данные удалены]";

// Marker for JSON-string payload columns (WebhookIngestEvent.payloadJson,
// IntegrationRunItem.normalizedPreviewJson): stays parseable JSON so
// consumers that JSON.parse these columns keep working after erasure.
export const redactedPayloadJson = JSON.stringify({ redacted: redactedText });

export function redactText(value: string): string;
export function redactText(value: string | null | undefined): string | null | undefined;
export function redactText(value: string | null | undefined) {
  if (!value) {
    return value;
  }

  return redactedText;
}

const sensitiveKeyFragments = ["email", "phone", "customer", "name", "body", "message"] as const;

function isSensitiveKey(key: string) {
  const normalizedKey = key.toLowerCase();

  return sensitiveKeyFragments.some((fragment) => normalizedKey.includes(fragment));
}

function redactMetadataValue(value: unknown, redactAllStrings: boolean): unknown {
  if (typeof value === "string") {
    return redactAllStrings ? redactedText : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactMetadataValue(item, redactAllStrings));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactMetadataValue(item, redactAllStrings || isSensitiveKey(key))
      ])
    );
  }

  return value;
}

export function redactMetadata(value: unknown): unknown {
  return redactMetadataValue(value, false);
}
