import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { apiError } from "@/lib/api/response";
import { verifySameOrigin } from "@/lib/api/session";
import { createTRPCContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";

const handler = (request: Request) => {
  const csrf = verifySameOrigin(request);

  if (!csrf.ok) {
    return apiError("forbidden", csrf.message, 403);
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: request,
    router: appRouter,
    createContext: createTRPCContext
  });
};

export { handler as GET, handler as POST };
