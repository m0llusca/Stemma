import { prisma } from "@/lib/db";

import {
  builtInDefaultLocale,
  getBuiltInEntries,
  type TranslationEntries
} from "./built-in";
import { baseLocaleCode, normalizeLocaleCode } from "./locale-codes";

type WorkspaceLocale = {
  id: string;
  code: string;
};

export type Dictionary = {
  locale: string;
  entries: TranslationEntries;
  t(key: string): string;
};

function uniqueLocaleCodes(codes: string[]): string[] {
  return [...new Set(codes)];
}

async function findPreferredEnabledLocale(
  workspaceId: string,
  codes: string[]
): Promise<WorkspaceLocale | null> {
  const locales = await prisma.locale.findMany({
    where: {
      workspaceId,
      code: {
        in: codes
      },
      isEnabled: true
    },
    select: {
      id: true,
      code: true
    }
  });

  return codes.map((code) => locales.find((locale) => locale.code === code)).find(Boolean) ?? null;
}

async function findDefaultEnabledLocale(workspaceId: string): Promise<WorkspaceLocale | null> {
  return prisma.locale.findFirst({
    where: {
      workspaceId,
      isDefault: true,
      isEnabled: true
    },
    select: {
      id: true,
      code: true
    }
  });
}

export async function getDictionary(
  workspaceId: string,
  requestedLocale: string
): Promise<Dictionary> {
  const normalizedRequestedLocale = normalizeLocaleCode(requestedLocale);
  const candidateLocaleCodes = uniqueLocaleCodes([
    normalizedRequestedLocale,
    baseLocaleCode(normalizedRequestedLocale)
  ]);
  const locale =
    (await findPreferredEnabledLocale(workspaceId, candidateLocaleCodes)) ??
    (await findDefaultEnabledLocale(workspaceId));
  const selectedLocaleCode = locale?.code ?? builtInDefaultLocale;
  const builtInEntries = getBuiltInEntries(selectedLocaleCode);

  if (!locale) {
    const entries = { ...builtInEntries };
    return {
      locale: builtInDefaultLocale,
      entries,
      t: (key) => entries[key] ?? key
    };
  }

  const values = await prisma.translationValue.findMany({
    where: {
      workspaceId,
      localeId: locale.id,
      publishedAt: {
        not: null
      },
      publishedText: {
        not: null
      }
    },
    select: {
      publishedText: true,
      key: {
        select: {
          namespace: true,
          key: true
        }
      }
    }
  });

  const entries = { ...builtInEntries };

  for (const value of values) {
    if (value.publishedText) {
      entries[`${value.key.namespace}.${value.key.key}`] = value.publishedText;
    }
  }

  return {
    locale: selectedLocaleCode,
    entries,
    t: (key) => entries[key] ?? key
  };
}
