export const certificationStatuses = [
  "docs_checked",
  "contract_certified",
  "stub_certified",
  "live_certified",
  "ready_for_live_certification",
  "waiting_for_access",
  "limited",
  "not_production_ready",
  "configuration_required",
  "secret_required",
  "certificate_required"
] as const;

export type CertificationStatus = (typeof certificationStatuses)[number];

export type CertificationGateSummary = {
  docs: CertificationStatus;
  contract: CertificationStatus;
  stub: CertificationStatus;
  live: CertificationStatus;
};

export type CertificationSummary = {
  status: CertificationStatus;
  label: string;
  productionReady: boolean;
};

export const certificationStatusLabels: Record<CertificationStatus, string> = {
  docs_checked: "Документация проверена",
  contract_certified: "Контрактные тесты пройдены",
  stub_certified: "Сертификация на заглушке пройдена",
  live_certified: "Живая сертификация пройдена",
  ready_for_live_certification: "Готово к живой сертификации",
  waiting_for_access: "Ожидает доступы",
  limited: "Есть ограничения",
  not_production_ready: "Не готово к промышленной эксплуатации",
  configuration_required: "Нужна настройка",
  secret_required: "Ожидает секрет",
  certificate_required: "Ожидает сертификат"
};

const liveBlockerStatuses: CertificationStatus[] = [
  "limited",
  "configuration_required",
  "secret_required",
  "certificate_required",
  "not_production_ready"
];

function hasCertifiedPrerequisites(gates: CertificationGateSummary) {
  return gates.docs === "docs_checked" && gates.contract === "contract_certified" && gates.stub === "stub_certified";
}

export function certificationStatusTone(status: CertificationStatus) {
  if (
    status === "live_certified" ||
    status === "docs_checked" ||
    status === "contract_certified" ||
    status === "stub_certified"
  ) {
    return "pill--ok";
  }

  if (
    status === "waiting_for_access" ||
    status === "secret_required" ||
    status === "certificate_required" ||
    status === "ready_for_live_certification" ||
    status === "not_production_ready" ||
    status === "configuration_required"
  ) {
    return "pill--warn";
  }

  return "pill--neutral";
}

export function summarizeCertification(gates: CertificationGateSummary): CertificationSummary {
  const prerequisitesCertified = hasCertifiedPrerequisites(gates);

  if (prerequisitesCertified && gates.live === "live_certified") {
    return {
      status: "live_certified",
      label: certificationStatusLabels.live_certified,
      productionReady: true
    };
  }

  if (prerequisitesCertified && gates.live === "waiting_for_access") {
    return {
      status: "ready_for_live_certification",
      label: certificationStatusLabels.ready_for_live_certification,
      productionReady: false
    };
  }

  if (prerequisitesCertified && liveBlockerStatuses.includes(gates.live)) {
    return {
      status: gates.live,
      label: certificationStatusLabels[gates.live],
      productionReady: false
    };
  }

  if (gates.live === "waiting_for_access") {
    return {
      status: "waiting_for_access",
      label: certificationStatusLabels.waiting_for_access,
      productionReady: false
    };
  }

  return {
    status: "not_production_ready",
    label: certificationStatusLabels.not_production_ready,
    productionReady: false
  };
}
