export type PaginationInput = {
  page?: string | null;
  limit?: string | null;
  defaultLimit?: number;
  maxLimit?: number;
};

export function firstQueryParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || undefined;
}

export function enumParam<T extends string>(searchParams: URLSearchParams, key: string, allowed: readonly T[]) {
  const value = firstQueryParam(searchParams, key)?.toUpperCase();

  if (!value) {
    return { ok: true as const, value: undefined };
  }

  return allowed.includes(value as T) ? { ok: true as const, value: value as T } : { ok: false as const, value };
}

export function splitTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function parsePositiveInteger(value: string | null | undefined, fallback: number, max?: number) {
  const parsed = Number(value ?? "");
  const normalized = Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;

  return max ? Math.min(normalized, max) : normalized;
}

export function parsePagination(input: PaginationInput) {
  const limit = parsePositiveInteger(input.limit, input.defaultLimit ?? 50, input.maxLimit ?? 100);
  const page = parsePositiveInteger(input.page, 1);

  return {
    page,
    limit,
    skip: (page - 1) * limit
  };
}

export function paginationMeta(input: { page: number; limit: number; total: number }) {
  const totalPages = Math.max(1, Math.ceil(input.total / input.limit));

  return {
    page: input.page,
    limit: input.limit,
    total: input.total,
    totalPages,
    hasNextPage: input.page < totalPages,
    hasPreviousPage: input.page > 1
  };
}

export function parseIsoDateParam(searchParams: URLSearchParams, key: string, endOfDay = false) {
  const value = firstQueryParam(searchParams, key);

  if (!value) {
    return undefined;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
    const date = new Date(`${value}T${time}Z`);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function safeJsonParse(value: string | null | undefined) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return {};
  }
}
