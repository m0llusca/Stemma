import { phaseBSourceContracts } from "@/lib/integrations/helpdesk-adapters/source-contracts";

export type OfficialDocTarget = {
  source: string;
  label: string;
  href: string;
  context7Id?: string;
  requiredBeforeCodeChange: true;
};

const maxDocAgeDays = 120;

const otrsFamilyDocTargets = [
  {
    source: "otrs",
    label: "OTRS GenericInterface",
    href: "https://doc.otrs.com/doc/manual/admin/6.0/en/html/genericinterface.html"
  },
  {
    source: "znuny",
    label: "Znuny documentation",
    href: "https://doc.znuny.org/"
  },
  {
    source: "otobo",
    label: "OTOBO REST API guide",
    href: "https://doc.otobo.org/manual/admin/11.0/en/content/processes-automation/web-services.html"
  }
] as const;

export function requiredOfficialDocTargets(): OfficialDocTarget[] {
  return [
    ...Object.values(phaseBSourceContracts).flatMap((contract) =>
      contract.officialDocs.map((doc) => ({
        source: contract.source,
        label: doc.label,
        href: doc.href,
        ...(doc.context7Id ? { context7Id: doc.context7Id } : {}),
        requiredBeforeCodeChange: true as const
      }))
    ),
    ...otrsFamilyDocTargets.map((doc) => ({
      ...doc,
      requiredBeforeCodeChange: true as const
    }))
  ];
}

export function assertContractDocsFresh(checkedAt: string, today = new Date()) {
  const checkedTime = new Date(`${checkedAt}T00:00:00.000Z`).getTime();
  const todayTime = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const ageDays = Math.floor((todayTime - checkedTime) / 86_400_000);

  return {
    ok: Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= maxDocAgeDays,
    ageDays
  };
}
