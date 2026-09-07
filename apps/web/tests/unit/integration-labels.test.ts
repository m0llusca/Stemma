import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLiveCertified } from "@/lib/certification/status";
import { getIntegrationCapability } from "@/lib/integrations/capabilities";
import {
  capabilityReadinessLabel,
  compactCertificationLabel,
  diagnosticReadinessHint,
  formatArticleCount,
  formatAttachmentCount,
  integrationListCertificationColumn,
  integrationListConnectionColumn,
  integrationModeLabel,
  integrationOpsStatusLabel,
  integrationRunItemStatusLabel,
  readinessActionLabel
} from "@/lib/integrations/labels";
import { integrationStatusLabel } from "@/lib/labels";

const integrationsPage = readFileSync(join(process.cwd(), "src/app/admin/integrations/page.tsx"), "utf8");
const integrationDetailPage = readFileSync(
  join(process.cwd(), "src/app/admin/integrations/[integrationId]/page.tsx"),
  "utf8"
);
const systemPage = readFileSync(join(process.cwd(), "src/app/admin/system/page.tsx"), "utf8");
const connectWizard = readFileSync(join(process.cwd(), "src/components/integrations/connect-source-form.tsx"), "utf8");

describe("integrationModeLabel", () => {
  it("maps known run modes to Russian labels", () => {
    expect(integrationModeLabel("preview")).toBe("Предпросмотр");
    expect(integrationModeLabel("dry_run")).toBe("Проверка без импорта");
    expect(integrationModeLabel("import")).toBe("Импорт");
    expect(integrationModeLabel("selected_import")).toBe("Выборочный импорт");
    expect(integrationModeLabel("manual_ticket_ids")).toBe("Ручные TicketID");
    expect(integrationModeLabel("ticket_search")).toBe("Поиск тикетов");
  });

  it("falls back to the raw value for unknown modes", () => {
    expect(integrationModeLabel("custom_mode")).toBe("custom_mode");
  });
});

describe("integrationRunItemStatusLabel", () => {
  it("maps known item statuses to Russian labels", () => {
    expect(integrationRunItemStatusLabel("previewed")).toBe("Предпросмотр");
    expect(integrationRunItemStatusLabel("queued")).toBe("В очереди");
    expect(integrationRunItemStatusLabel("imported")).toBe("Импортировано");
    expect(integrationRunItemStatusLabel("failed")).toBe("Ошибка");
  });

  it("falls back to the raw value for unknown statuses", () => {
    expect(integrationRunItemStatusLabel("mystery")).toBe("mystery");
  });
});

describe("formatArticleCount", () => {
  it("pluralizes Russian article forms", () => {
    expect(formatArticleCount(1)).toBe("1 статья");
    expect(formatArticleCount(3)).toBe("3 статьи");
    expect(formatArticleCount(5)).toBe("5 статей");
    expect(formatArticleCount(21)).toBe("21 статья");
  });
});

describe("formatAttachmentCount", () => {
  it("pluralizes Russian attachment forms", () => {
    expect(formatAttachmentCount(1)).toBe("1 файл");
    expect(formatAttachmentCount(2)).toBe("2 файла");
    expect(formatAttachmentCount(5)).toBe("5 файлов");
  });
});

describe("capabilityReadinessLabel", () => {
  it("never claims production-ready for production_slice without live cert", () => {
    expect(capabilityReadinessLabel("production_slice")).toBe("Срез для внедрения");
    expect(capabilityReadinessLabel("production_slice", "ready_for_live_certification")).toBe("Срез для внедрения");
    expect(capabilityReadinessLabel("production_slice", "stub_certified")).toBe("Срез для внедрения");
    expect(capabilityReadinessLabel("production_slice", "docs_checked")).toBe("Срез для внедрения");
    expect(capabilityReadinessLabel("production_slice", null)).not.toBe("Готово к эксплуатации");
  });

  it("allows production-ready copy only after live_certified", () => {
    expect(capabilityReadinessLabel("production_slice", "live_certified")).toBe("Готово к эксплуатации");
    expect(capabilityReadinessLabel("adapter_ready")).toBe("Адаптер готов");
    expect(capabilityReadinessLabel("adapter_ready", "live_certified")).toBe("Адаптер готов");
    expect(capabilityReadinessLabel("roadmap")).toBe("В плане");
  });
});

describe("readinessActionLabel", () => {
  it("treats URL+secrets as filled access, not live-cert readiness", () => {
    expect(readinessActionLabel(true, true)).toBe("Доступы заполнены");
    expect(readinessActionLabel(true, true)).not.toContain("живой сертификации");
    expect(readinessActionLabel(true, false)).toBe("Ожидает доступы");
    expect(readinessActionLabel(false, true)).toBe("Ожидает доступы");
    expect(diagnosticReadinessHint(true)).toBe("Можно запускать диагностику");
    expect(diagnosticReadinessHint(false)).toBeNull();
  });
});

describe("compactCertificationLabel", () => {
  it("keeps Живая / Live distinct from dry-run or generic проверки", () => {
    expect(compactCertificationLabel("Живая сертификация пройдена")).toBe("Живая сертификация пройдена");
    expect(compactCertificationLabel("Готово к живой сертификации")).toBe("Готово к живой сертификации");
    expect(compactCertificationLabel("Живая сертификация пройдена")).not.toBe("Проверка пройдена");
    expect(compactCertificationLabel("Готово к живой сертификации")).not.toBe("Готово к проверке");
    expect(compactCertificationLabel("Сертификация на заглушке пройдена")).toContain("заглушке");
    expect(compactCertificationLabel("Не готово к промышленной эксплуатации")).toBe("Не готово");
  });
});

describe("integrationOpsStatusLabel", () => {
  it("softens active/ready when the source is not live-certified", () => {
    expect(integrationOpsStatusLabel("active")).toBe("Включена");
    expect(integrationOpsStatusLabel("active", "ready_for_live_certification")).toBe("Включена");
    expect(integrationOpsStatusLabel("ready", "stub_certified")).toBe("Настроена");
    expect(integrationOpsStatusLabel("active", null)).not.toBe("Активна");
    expect(integrationStatusLabel("active", "docs_checked")).toBe("Включена");
  });

  it("keeps live ops wording only after live cert", () => {
    expect(integrationOpsStatusLabel("active", "live_certified")).toBe("Активна");
    expect(integrationOpsStatusLabel("ready", "live_certified")).toBe("Готова к подключению");
    expect(integrationOpsStatusLabel("queued", "live_certified")).toBe("В очереди");
    expect(integrationOpsStatusLabel("error")).toBe("Ошибка");
    expect(integrationStatusLabel("active", "live_certified")).toBe("Активна");
  });
});

describe("adversarial: catalog source active without live cert", () => {
  it("does not claim production-ready or live-active for OTRS", () => {
    const otrs = getIntegrationCapability("otrs");

    expect(otrs.readiness).toBe("production_slice");
    expect(isLiveCertified(otrs.certification.summary.status)).toBe(false);
    expect(capabilityReadinessLabel(otrs.readiness, otrs.certification.summary.status)).toBe("Срез для внедрения");
    expect(capabilityReadinessLabel(otrs.readiness, otrs.certification.summary.status)).not.toContain("эксплуатации");
    expect(integrationOpsStatusLabel("active", otrs.certification.summary.status)).toBe("Включена");
    expect(integrationOpsStatusLabel("ready", otrs.certification.summary.status)).toBe("Настроена");
    expect(readinessActionLabel(true, true)).toBe("Доступы заполнены");
    expect(compactCertificationLabel(otrs.certification.summary.label)).toMatch(/жив/i);
    expect(compactCertificationLabel(otrs.certification.summary.label)).not.toBe("Готово к проверке");
  });
});

describe("admin list columns and copy wiring", () => {
  it("splits ops connection status from certification", () => {
    expect(integrationListConnectionColumn).toBe("Статус подключения");
    expect(integrationListCertificationColumn).toBe("Сертификация");
    expect(integrationsPage).toContain("integrationListConnectionColumn");
    expect(integrationsPage).toContain("integrationListCertificationColumn");
    expect(integrationsPage).not.toContain("Состояние подключения");
    expect(integrationsPage).toContain("capabilityReadinessLabel(capability.readiness, certificationStatus)");
    expect(integrationsPage).toContain("integrationStatusLabel(integration.status, certificationStatus)");
    expect(integrationsPage).toContain("readinessActionLabel(hasBaseUrl, hasRequiredSecrets)");
    expect(integrationsPage).not.toContain('production_slice: "Готово к эксплуатации"');
    expect(integrationsPage).not.toContain('"Живая сертификация пройдена": "Проверка пройдена"');
    expect(integrationsPage).not.toContain('"Готово к живой сертификации": "Готово к проверке"');
  });

  it("aligns detail and system ops labels with the same honesty helpers", () => {
    expect(integrationDetailPage).toContain('from "@/lib/integrations/labels"');
    expect(integrationDetailPage).toContain("readinessActionLabel(hasBaseUrl, hasRequiredSecrets)");
    expect(integrationDetailPage).toContain("diagnosticReadinessHint(");
    expect(integrationDetailPage).not.toContain('? "Готово к живой сертификации"');
    expect(integrationDetailPage).not.toContain("свидетельствам боевого режима");
    expect(integrationDetailPage).toContain("integrationStatusLabel(integration.status, capability.certification.summary.status)");
    expect(systemPage).toContain("integrationStatusLabel(integration.status, capability.certification.summary.status)");
  });

  it("keeps list/detail pre-cert wording aligned with the connect wizard", () => {
    expect(connectWizard).toContain("Зелёный production-ready — только после живой сертификации");
    expect(connectWizard).toContain("Живая сертификация — отдельный шаг с evidence");
    expect(integrationsPage).toContain("capabilityReadinessLabel");
    expect(integrationDetailPage).toContain("readinessActionLabel");
  });
});
