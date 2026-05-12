import { z } from "zod";
import { otrsFamilyProfiles, type OtrsProduct } from "@/lib/integrations/otrs-family/profiles";

const defaultProduct = "otrs_ce_6" satisfies OtrsProduct;
const maxSearchLimit = 100;
const maxManualTicketIdLimit = 50;
const maxBatchSize = 50;
const maxRequestTimeoutMs = 60_000;
const maxResponseBytes = 10_000_000;

const allowedSecretReferenceKeys = new Set(["caBundleSecretId"]);
const rawAuthQueryPattern =
  /(?:^|[?&#;])(?:userlogin|password|sessionid|token|bearertoken|accesstoken|apitoken|clientsecret|authorization)=/i;

const productSchema = z.enum(["otrs_ce_6", "znuny_lts", "otobo"]);
const methodSchema = z.enum(["GET", "POST"]);
const pathSchema = z.string().trim().min(1).regex(/^\//);
const authFlowSchema = z.enum(["credentials", "session"]);
const optionalTrimmedStringSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .nullable()
  .transform((value) => value ?? null);

const routesInputSchema = z
  .object({
    ticketSearchPath: pathSchema.optional(),
    ticketGetPath: pathSchema.optional(),
    ticketSearchMethod: methodSchema.optional(),
    ticketGetMethod: methodSchema.optional()
  });

const limitsInputSchema = z
  .object({
    searchLimit: z.number().int().positive().optional(),
    manualTicketIdLimit: z.number().int().positive().optional(),
    batchSize: z.number().int().positive().optional(),
    requestTimeoutMs: z.number().int().positive().optional(),
    maxResponseBytes: z.number().int().positive().optional()
  })
  .passthrough();

const rawConfigSchema = z
  .object({
    connector: z.literal("otrs_family").optional(),
    configVersion: z.literal(1).optional(),
    product: productSchema.optional(),
    webServiceName: z.string().trim().min(1).optional(),
    basePath: pathSchema.optional(),
    routes: routesInputSchema.optional(),
    requestMode: z
      .object({
        ticketSearch: z.enum(["post_json", "get_query"]).optional(),
        ticketGet: z.enum(["get_query", "post_json"]).optional()
      })
      .passthrough()
      .optional(),
    auth: z
      .object({
        ticketSearch: authFlowSchema.optional(),
        ticketGet: authFlowSchema.optional(),
        sessionCreatePath: pathSchema.optional(),
        sessionCreateMethod: z.literal("POST").optional()
      })
      .passthrough()
      .optional(),
    articlePolicy: z
      .object({
        importAllArticles: z.boolean().optional(),
        preservePrivateFlag: z.boolean().optional()
      })
      .passthrough()
      .optional(),
    attachmentPolicy: z
      .object({
        mode: z.literal("external_links_only").optional()
      })
      .passthrough()
      .optional(),
    limits: limitsInputSchema.optional(),
    tls: z
      .object({
        caBundleSecretId: optionalTrimmedStringSchema,
        caFingerprint: optionalTrimmedStringSchema
      })
      .passthrough()
      .optional(),
    advanced: z
      .object({
        routeOverridesEnabled: z.boolean().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()
  .superRefine((value, ctx) => {
    const secretPath = findForbiddenConfigPath(value);

    if (secretPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `OTRS connector config must not contain secrets (${secretPath}).`
      });
    }

    const product = value.product ?? defaultProduct;
    const profile = otrsFamilyProfiles[product];
    const routeOverridesEnabled = value.advanced?.routeOverridesEnabled ?? false;
    const profileRoutes = profileRoutesForProduct(product);
    const hasRouteOverride = Object.entries(value.routes ?? {}).some(
      ([key, routeValue]) => routeValue !== undefined && routeValue !== profileRoutes[key as keyof typeof profileRoutes]
    );

    if (hasRouteOverride && !routeOverridesEnabled) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `OTRS route overrides require advanced.routeOverridesEnabled for ${profile.label}.`
      });
    }
  })
  .transform((value) => {
    const product = value.product ?? defaultProduct;
    const profile = otrsFamilyProfiles[product];
    const routes = {
      ...profileRoutesForProduct(product),
      ...(value.routes ?? {})
    };

    return {
      connector: "otrs_family" as const,
      configVersion: 1 as const,
      product,
      webServiceName: value.webServiceName ?? profile.webServiceName,
      basePath: normalizePath(value.basePath ?? profile.basePath),
      routes,
      requestMode: {
        ticketSearch: value.requestMode?.ticketSearch ?? requestModeForMethod(routes.ticketSearchMethod),
        ticketGet: value.requestMode?.ticketGet ?? requestModeForMethod(routes.ticketGetMethod)
      },
      auth: {
        ticketSearch: value.auth?.ticketSearch ?? "credentials",
        ticketGet: value.auth?.ticketGet ?? "credentials",
        sessionCreatePath: normalizePath(value.auth?.sessionCreatePath ?? "/Session"),
        sessionCreateMethod: value.auth?.sessionCreateMethod ?? "POST"
      },
      articlePolicy: {
        importAllArticles: value.articlePolicy?.importAllArticles ?? true,
        preservePrivateFlag: value.articlePolicy?.preservePrivateFlag ?? true
      },
      attachmentPolicy: {
        mode: value.attachmentPolicy?.mode ?? "external_links_only"
      },
      limits: {
        searchLimit: clampLimit(value.limits?.searchLimit ?? 50, maxSearchLimit),
        manualTicketIdLimit: clampLimit(value.limits?.manualTicketIdLimit ?? 20, maxManualTicketIdLimit),
        batchSize: clampLimit(value.limits?.batchSize ?? 25, maxBatchSize),
        requestTimeoutMs: clampLimit(value.limits?.requestTimeoutMs ?? 15000, maxRequestTimeoutMs),
        maxResponseBytes: clampLimit(value.limits?.maxResponseBytes ?? 5_000_000, maxResponseBytes)
      },
      tls: {
        caBundleSecretId: value.tls?.caBundleSecretId ?? null,
        caFingerprint: value.tls?.caFingerprint ?? null
      },
      advanced: {
        routeOverridesEnabled: value.advanced?.routeOverridesEnabled ?? false
      }
    };
  });

export const otrsConnectorConfigSchema = z.preprocess(parseConfigJsonValue, rawConfigSchema);

export type OtrsConnectorConfig = z.infer<typeof otrsConnectorConfigSchema>;

export function parseOtrsConnectorConfig(value: string | unknown): OtrsConnectorConfig {
  const parsed = otrsConnectorConfigSchema.safeParse(value);

  if (!parsed.success) {
    throw new Error(`Invalid OTRS connector config: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }

  return parsed.data;
}

export function buildDefaultOtrsConnectorConfig(product: OtrsProduct = defaultProduct): OtrsConnectorConfig {
  return parseOtrsConnectorConfig({ product });
}

export function assertNoOtrsSecretsInConfig(value: unknown) {
  const parsed = parseConfigJsonValue(value);
  const secretPath = findForbiddenConfigPath(parsed);

  if (secretPath) {
    throw new Error(`OTRS connector config must not contain secrets (${secretPath}).`);
  }
}

export function buildOtrsWebServiceBaseUrl(input: { origin?: string; baseUrl?: string; basePath?: string; webServiceName: string }) {
  const root = input.baseUrl
    ? stripTrailingSlash(input.baseUrl)
    : `${stripTrailingSlash(input.origin ?? "")}${normalizePath(input.basePath ?? "")}`;
  return `${stripTrailingSlash(root)}/nph-genericinterface.pl/Webservice/${encodeURIComponent(input.webServiceName)}`;
}

export function redactOtrsConfigForUi(config: OtrsConnectorConfig): OtrsConnectorConfig {
  return {
    ...config,
    tls: {
      ...config.tls,
      caBundleSecretId: null
    }
  };
}

function profileRoutesForProduct(product: OtrsProduct) {
  const profile = otrsFamilyProfiles[product];

  return {
    ticketSearchPath: profile.ticketSearchPath,
    ticketGetPath: profile.ticketGetPath,
    ticketSearchMethod: profile.ticketSearchMethod,
    ticketGetMethod: profile.ticketGetMethod
  };
}

function parseConfigJsonValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function findForbiddenConfigPath(value: unknown, path: string[] = []): string | undefined {
  if (typeof value === "string") {
    return rawAuthQueryPattern.test(value) ? path.join(".") || "<string>" : undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nestedPath = findForbiddenConfigPath(value[index], [...path, String(index)]);

      if (nestedPath) {
        return nestedPath;
      }
    }

    return undefined;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const keyPath = [...path, key].join(".");

    if (isForbiddenConfigKey(key)) {
      return keyPath;
    }

    const nestedPath = findForbiddenConfigPath(nestedValue, [...path, key]);

    if (nestedPath) {
      return nestedPath;
    }
  }

  return undefined;
}

function isForbiddenConfigKey(key: string) {
  if (allowedSecretReferenceKeys.has(key)) {
    return false;
  }

  return /(password|token|secret|authorization|sessionid|cabundle)/i.test(key);
}

function requestModeForMethod(method: "GET" | "POST") {
  return method === "POST" ? "post_json" : "get_query";
}

function clampLimit(value: number, max: number) {
  return Math.max(1, Math.min(value, max));
}

function normalizePath(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function stripTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}
