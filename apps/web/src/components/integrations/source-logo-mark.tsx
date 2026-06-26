import type { CSSProperties } from "react";

export type SourceMeta = {
  color: string;
  hint: string;
  logo: SourceLogo;
};

type SourceLogo =
  | {
      kind: "svg";
      path: string;
      title: string;
      viewBox?: string;
    }
  | {
      kind: "image";
      src: string;
      title: string;
      fit?: "contain" | "cover";
    };

type SourceMarkStyle = CSSProperties & {
  "--source-color": string;
};

const SIMPLE_ICON_PATHS = {
  zendesk:
    "M12.914 2.904V16.29L24 2.905H12.914zM0 2.906C0 5.966 2.483 8.45 5.543 8.45s5.542-2.484 5.543-5.544H0zm11.086 4.807L0 21.096h11.086V7.713zm7.37 7.84c-3.063 0-5.542 2.48-5.542 5.543H24c0-3.06-2.48-5.543-5.543-5.543z",
  intercom:
    "M21 0H3C1.343 0 0 1.343 0 3v18c0 1.658 1.343 3 3 3h18c1.658 0 3-1.342 3-3V3c0-1.657-1.342-3-3-3zm-5.801 4.399c0-.44.36-.8.802-.8.44 0 .8.36.8.8v10.688c0 .442-.36.801-.8.801-.443 0-.802-.359-.802-.801V4.399zM11.2 3.994c0-.44.357-.799.8-.799s.8.359.8.799v11.602c0 .44-.357.8-.8.8s-.8-.36-.8-.8V3.994zm-4 .405c0-.44.359-.8.799-.8.443 0 .802.36.802.8v10.688c0 .442-.36.801-.802.801-.44 0-.799-.359-.799-.801V4.399zM3.199 6c0-.442.36-.8.802-.8.44 0 .799.358.799.8v7.195c0 .441-.359.8-.799.8-.443 0-.802-.36-.802-.8V6zM20.52 18.202c-.123.105-3.086 2.593-8.52 2.593-5.433 0-8.397-2.486-8.521-2.593-.335-.288-.375-.792-.086-1.128.285-.334.79-.375 1.125-.09.047.041 2.693 2.211 7.481 2.211 4.848 0 7.456-2.186 7.479-2.207.334-.289.839-.25 1.128.086.289.336.25.84-.086 1.128zm.281-5.007c0 .441-.36.8-.801.8-.441 0-.801-.36-.801-.8V6c0-.442.361-.8.801-.8.441 0 .801.357.801.8v7.195z",
  hubspot:
    "M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z",
  jira:
    "M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.001 1.001 0 0 0 23.013 0Z",
  webhook:
    "M7.5 4.75a3.75 3.75 0 0 1 7.27-1.31l-1.9.7A1.75 1.75 0 1 0 10.2 6.1l1.72 2.98-1.73 1-1.72-2.98A3.74 3.74 0 0 1 7.5 4.75Zm8.58 4.18a3.75 3.75 0 0 1 3.36 6.68 3.75 3.75 0 0 1-5.55-3.85h2.01a1.75 1.75 0 1 0 1.16-1.2l-3.43.02-.02-2 3.43-.02c.28-.01.56.02.84.08ZM7.1 12.24l1.01 1.74a1.75 1.75 0 1 0 1.51 2.22l1.9.68a3.75 3.75 0 1 1-3.04-4.86L6.77 9.04l1.73-1 1.72 2.98-3.12 1.22Z",
  api:
    "M5.5 5.25A2.25 2.25 0 0 1 7.75 3h2.5v2h-2.5a.25.25 0 0 0-.25.25v13.5c0 .14.11.25.25.25h2.5v2h-2.5a2.25 2.25 0 0 1-2.25-2.25V5.25Zm8.25-2.25h2.5a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.25 21h-2.5v-2h2.5c.14 0 .25-.11.25-.25V5.25a.25.25 0 0 0-.25-.25h-2.5V3Zm-1.3 6.1 1.9.63-2.8 8.4-1.9-.63 2.8-8.4Zm-3.71 1.6-1.56 1.3 1.56 1.3-1.28 1.54L4.06 12l3.4-2.84 1.28 1.54Zm6.52 0 1.28-1.54 3.4 2.84-3.4 2.84-1.28-1.54 1.56-1.3-1.56-1.3Z"
} as const;

const SOURCE_META: Record<string, SourceMeta> = {
  otrs: {
    color: "#0a6c9e",
    hint: "Тикеты через GenericInterface",
    logo: { kind: "image", title: "OTRS", src: "https://otrs.com/wp-content/uploads/2018/03/cropped-OTRS-LOGO-without-tagline-192x192.png" }
  },
  znuny: {
    color: "#d97706",
    hint: "Форк OTRS — совместимый API",
    logo: { kind: "image", title: "Znuny", src: "https://www.znuny.org/favicon.ico" }
  },
  otobo: {
    color: "#0d9488",
    hint: "Форк OTRS — совместимый API",
    logo: { kind: "image", title: "OTOBO", src: "https://otobo.io/wp-content/uploads/2024/07/favicon-96x96-1.png" }
  },
  zendesk: {
    color: "#03363d",
    hint: "Тикеты Zendesk Support",
    logo: { kind: "svg", title: "Zendesk", path: SIMPLE_ICON_PATHS.zendesk }
  },
  freshdesk: {
    color: "#15b886",
    hint: "Тикеты Freshdesk",
    logo: { kind: "image", title: "Freshdesk", src: "https://www.google.com/s2/favicons?domain=freshdesk.com&sz=64" }
  },
  intercom: {
    color: "#1f6feb",
    hint: "Диалоги Intercom",
    logo: { kind: "svg", title: "Intercom", path: SIMPLE_ICON_PATHS.intercom }
  },
  hubspot: {
    color: "#ff5c35",
    hint: "Тикеты Service Hub",
    logo: { kind: "svg", title: "HubSpot", path: SIMPLE_ICON_PATHS.hubspot }
  },
  jira: {
    color: "#2563eb",
    hint: "Заявки Jira Service Management",
    logo: { kind: "svg", title: "Jira", path: SIMPLE_ICON_PATHS.jira }
  },
  salesforce: {
    color: "#0176d3",
    hint: "Кейсы Service Cloud",
    logo: { kind: "image", title: "Salesforce", src: "https://www.google.com/s2/favicons?domain=salesforce.com&sz=64" }
  },
  servicenow: {
    color: "#1f8476",
    hint: "Инциденты ITSM",
    logo: { kind: "image", title: "ServiceNow", src: "https://www.google.com/s2/favicons?domain=servicenow.com&sz=64" }
  },
  dynamics: {
    color: "#0b53ce",
    hint: "Кейсы Customer Service",
    logo: { kind: "image", title: "Microsoft Dynamics 365", src: "https://www.google.com/s2/favicons?domain=dynamics.microsoft.com&sz=64" }
  },
  ydb: {
    color: "#1d4ed8",
    hint: "Таблицы диалогов в YDB",
    logo: { kind: "image", title: "YDB", src: "https://storage.yandexcloud.net/ydb-site-assets/ydb_icon.svg" }
  },
  ytsaurus: {
    color: "#c2410c",
    hint: "Таблицы диалогов в YTsaurus",
    logo: { kind: "image", title: "YTsaurus", src: "https://ytsaurus.tech/favicon/120x120.png" }
  },
  generic_webhook: {
    color: "#52606d",
    hint: "Входящие события через webhook",
    logo: { kind: "svg", title: "Webhook", path: SIMPLE_ICON_PATHS.webhook }
  },
  custom_api: {
    color: "#334155",
    hint: "Собственный контракт импорта",
    logo: { kind: "svg", title: "API", path: SIMPLE_ICON_PATHS.api }
  }
};

function normalizeSourceKey(source: string, label?: string) {
  const normalized = source.trim().toLowerCase();
  const normalizedLabel = label?.trim().toLowerCase() ?? "";

  if (normalized === "otrs_family") {
    if (normalizedLabel.includes("znuny")) return "znuny";
    if (normalizedLabel.includes("otobo")) return "otobo";
    return "otrs";
  }

  if (normalized === "jira_service") return "jira";

  return normalized;
}

export function sourceLogoMeta(source: string, label?: string): SourceMeta {
  const sourceKey = normalizeSourceKey(source, label);

  return (
    SOURCE_META[sourceKey] ?? {
      color: "var(--accent)",
      hint: "Импорт диалогов",
      logo: { kind: "image", title: label ?? source, src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(sourceKey)}.com&sz=64` }
    }
  );
}

export function SourceLogoMark({
  source,
  label,
  meta,
  className
}: {
  source?: string;
  label?: string;
  meta?: SourceMeta;
  className?: string;
}) {
  const resolvedMeta = meta ?? sourceLogoMeta(source ?? "", label);
  const classes = ["source-logo-mark", "connect-source-card__mark", className].filter(Boolean).join(" ");

  return (
    <span className={classes} style={{ "--source-color": resolvedMeta.color } as SourceMarkStyle} aria-hidden="true">
      {resolvedMeta.logo.kind === "svg" ? (
        <svg viewBox={resolvedMeta.logo.viewBox ?? "0 0 24 24"} focusable="false">
          <path d={resolvedMeta.logo.path} />
        </svg>
      ) : (
        <img src={resolvedMeta.logo.src} alt="" loading="lazy" referrerPolicy="no-referrer" data-fit={resolvedMeta.logo.fit ?? "contain"} />
      )}
    </span>
  );
}
