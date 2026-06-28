import { createDynamicsAdapter } from "@/lib/integrations/helpdesk-adapters/dynamics";
import { createFreshdeskAdapter } from "@/lib/integrations/helpdesk-adapters/freshdesk";
import { createHubspotAdapter } from "@/lib/integrations/helpdesk-adapters/hubspot";
import { createIntercomAdapter } from "@/lib/integrations/helpdesk-adapters/intercom";
import { createJiraAdapter } from "@/lib/integrations/helpdesk-adapters/jira";
import { createSalesforceAdapter } from "@/lib/integrations/helpdesk-adapters/salesforce";
import { createServiceNowAdapter } from "@/lib/integrations/helpdesk-adapters/servicenow";
import { createZendeskAdapter } from "@/lib/integrations/helpdesk-adapters/zendesk";
import type { HelpdeskAdapter, PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export function createHelpdeskAdapter(source: PhaseBHelpdeskSource): HelpdeskAdapter {
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

  if (source === "jira") {
    return createJiraAdapter();
  }

  if (source === "salesforce") {
    return createSalesforceAdapter();
  }

  if (source === "servicenow") {
    return createServiceNowAdapter();
  }

  if (source === "dynamics") {
    return createDynamicsAdapter();
  }

  throw new Error(`Adapter ${source} is not implemented in this task.`);
}
