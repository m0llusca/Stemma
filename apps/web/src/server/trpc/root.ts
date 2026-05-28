import { createTRPCRouter, publicProcedure } from "@/server/trpc/init";
import { integrationsRouter } from "@/server/trpc/routers/integrations";

export const appRouter = createTRPCRouter({
  health: publicProcedure.query(() => ({ ok: true })),
  integrations: integrationsRouter
});

export type AppRouter = typeof appRouter;
