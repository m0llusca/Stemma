import { listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import { createTRPCRouter, protectedProcedure } from "@/server/trpc/init";

export const integrationsRouter = createTRPCRouter({
  catalog: protectedProcedure.query(() => listIntegrationCapabilities())
});
