import { recordIntegrationDryRunFromInput } from "@/lib/integration-actions";
import { integrationQueueImportOutputSchema, secretlessIntegrationSetupInputSchema } from "@/lib/integration-setup-schema";
import { listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { createTRPCRouter, permissionProcedure } from "@/server/trpc/init";

export const integrationsRouter = createTRPCRouter({
  catalog: permissionProcedure("integrations:manage").query(() => listIntegrationCapabilities()),
  queueImport: permissionProcedure("integrations:manage")
    .input(secretlessIntegrationSetupInputSchema)
    .output(integrationQueueImportOutputSchema)
    .mutation(({ input }) => {
      return recordIntegrationDryRunFromInput(input);
    })
});
