import {
  integrationSetupInputSchema,
  recordIntegrationDryRunFromInput
} from "@/lib/integration-actions";
import { listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { createTRPCRouter, permissionProcedure, protectedProcedure } from "@/server/trpc/init";

export const integrationsRouter = createTRPCRouter({
  catalog: permissionProcedure("integrations:manage").query(() => listIntegrationCapabilities()),
  queueImport: protectedProcedure.input(integrationSetupInputSchema).mutation(({ input }) => {
    return recordIntegrationDryRunFromInput(input);
  })
});
