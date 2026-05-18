import { createFreshdeskAdapter } from "@/lib/integrations/helpdesk-adapters/freshdesk";
import { createZendeskAdapter } from "@/lib/integrations/helpdesk-adapters/zendesk";
import type { PhaseBHelpdeskSource } from "@/lib/integrations/helpdesk-adapters/types";

export function createHelpdeskAdapter(source: PhaseBHelpdeskSource) {
  if (source === "zendesk") {
    return createZendeskAdapter();
  }

  if (source === "freshdesk") {
    return createFreshdeskAdapter();
  }

  throw new Error(`Adapter ${source} is not implemented in this task.`);
}
