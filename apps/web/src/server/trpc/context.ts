import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";

export type TrpcContext = {
  user: Awaited<ReturnType<typeof getCurrentUser>> | null;
};

export async function createTRPCContext(): Promise<TrpcContext> {
  const user = await getCurrentUser().catch((error: unknown) => {
    if (error instanceof AuthRequiredError) {
      return null;
    }

    throw error;
  });

  return { user };
}
