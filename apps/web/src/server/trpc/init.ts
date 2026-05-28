import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { TrpcContext } from "@/server/trpc/context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Нет активной пользовательской сессии." });
  }

  return next({
    ctx: {
      user: ctx.user
    }
  });
});

export const permissionProcedure = (permission: Permission) =>
  protectedProcedure.use(({ ctx, next }) => {
    if (!hasPermission(ctx.user.role, permission)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Недостаточно прав для выполнения операции." });
    }

    return next({
      ctx: {
        user: ctx.user
      }
    });
  });
