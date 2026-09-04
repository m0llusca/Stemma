import { decryptSecret } from "@/lib/secrets";

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

export function isManagedSecretReference(value: string) {
  return /^(env|vault|secret):[A-Za-z0-9_.:/@-]+$/.test(value.trim());
}

export function isEncryptedSecretReference(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("v1:") && trimmed.split(":").length >= 4;
}

export function isSupportedSecretReference(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("env:") || isEncryptedSecretReference(trimmed);
}

export function assertProductionSecretReference(value: string | null | undefined, label = "Секрет клиента") {
  const trimmed = value?.trim();

  if (!isProductionRuntime() || !trimmed) {
    return;
  }

  // Production save must only accept refs this runtime can execute (env: / v1:).
  // vault:/secret: remain recognized as "managed-shaped" for detection elsewhere,
  // but must not pass the production gate — that would green-wash unsupported refs.
  if (trimmed.startsWith("vault:") || trimmed.startsWith("secret:")) {
    throw new Error(
      `${label} использует vault:/secret:-ссылку; в production поддерживаются только env:- и зашифрованные v1:-ссылки.`
    );
  }

  if (!isSupportedSecretReference(trimmed)) {
    throw new Error(`${label} в production должен быть env:- или зашифрованной v1:-ссылкой, а не inline-значением.`);
  }
}

export function assertSupportedSecretReference(value: string | null | undefined, label: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return;
  }

  if (trimmed.startsWith("vault:") || trimmed.startsWith("secret:")) {
    throw new Error(
      `${label} использует vault:/secret:-ссылку; в текущем runtime поддерживаются только env:- и зашифрованные v1:-ссылки.`
    );
  }

  if (!isSupportedSecretReference(trimmed)) {
    throw new Error(`${label} должен быть env:- или зашифрованной v1:-ссылкой.`);
  }
}

export function resolveSecretReference(ref: string | null | undefined, label: string) {
  const trimmed = ref?.trim();

  if (!trimmed) {
    throw new Error(`${label} не настроен.`);
  }

  if (trimmed.startsWith("env:")) {
    const value = process.env[trimmed.slice("env:".length)];

    if (!value) {
      throw new Error(`${label} ссылается на пустую или отсутствующую переменную окружения.`);
    }

    return value;
  }

  if (isEncryptedSecretReference(trimmed)) {
    return decryptSecret(trimmed);
  }

  if (trimmed.startsWith("vault:") || trimmed.startsWith("secret:")) {
    throw new Error(
      `${label} использует vault:/secret:-ссылку, но в текущем runtime исполняются только env:- и зашифрованные v1:-ссылки.`
    );
  }

  if (isProductionRuntime()) {
    throw new Error(`${label} в production должен быть env:- или зашифрованной v1:-ссылкой, а не inline-значением.`);
  }

  return trimmed;
}
