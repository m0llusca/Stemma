import { helpdeskProfiles } from "@/lib/integrations/connect/profiles/helpdesk";
import { otrsConnectionProfile } from "@/lib/integrations/connect/profiles/otrs";
import { dataSourceProfiles } from "@/lib/integrations/connect/profiles/data-source";
import {
  enterpriseProfiles,
  limitedSupportSources
} from "@/lib/integrations/connect/profiles/enterprise";
import type { SourceConnectionProfile } from "@/lib/integrations/connect/types";

// Реестр профилей подключения по источнику. Серверный модуль — тащит адаптеры
// и драйверы, поэтому импортируется только из server-action и серверного кода,
// никогда из клиентского бандла. znuny/otobo — тот же OTRS-профиль с другим
// значением source (одно семейство GenericInterface).
const REGISTRY: Record<string, SourceConnectionProfile> = {
  ...helpdeskProfiles,
  otrs: otrsConnectionProfile,
  znuny: { ...otrsConnectionProfile, source: "znuny" },
  otobo: { ...otrsConnectionProfile, source: "otobo" },
  ...dataSourceProfiles,
  ...enterpriseProfiles
};

export function getConnectionProfile(source: string): SourceConnectionProfile | undefined {
  return REGISTRY[source];
}

export function listConnectionProfiles(): SourceConnectionProfile[] {
  return Object.values(REGISTRY);
}

export { limitedSupportSources };
