import { createFreshdeskAdapter } from "@/lib/integrations/helpdesk-adapters/freshdesk";
import { createHubspotAdapter } from "@/lib/integrations/helpdesk-adapters/hubspot";
import { createIntercomAdapter } from "@/lib/integrations/helpdesk-adapters/intercom";
import { createZendeskAdapter } from "@/lib/integrations/helpdesk-adapters/zendesk";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export function createHelpdeskAdapter(source: PhaseBHelpdeskSource) {
  if (source === "zendesk") {
    return createZendeskAdapter();
  }

  if (source === "freshdesk") {
    return createFreshdeskAdapter();
  }

  if (source === "intercom") {
    return createIntercomAdapter();
  }

  if (source === "hubspot") {
    return createHubspotAdapter();
  }

  throw new Error(`Adapter ${source} is not implemented in this task.`);
}
