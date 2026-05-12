import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UserRoundCheck } from "lucide-react";
import { getValidAuthSession, sessionCookieName } from "@/lib/auth/session";
import { isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { signInWithLocalCredentials, switchCurrentUser } from "@/lib/user-actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const providerStatusLabels: Record<string, string> = {
  active: "Активен",
  draft: "Черновик"
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/reviews";
}

function ssoHref(input: { provider: string; workspaceId: string; returnTo: string }) {
  const params = new URLSearchParams({
    provider: input.provider,
    workspaceId: input.workspaceId,
    returnTo: input.returnTo
  });

  return `/auth/sso?${params.toString()}`;
}

function providerSelectionHref(input: { provider: string; workspaceId: string; returnTo: string }) {
  const params = new URLSearchParams({
    provider: input.provider,
    workspaceId: input.workspaceId,
    returnTo: input.returnTo
  });

  return `/auth/login?${params.toString()}`;
}

function demoUserOptionLabel(user: {
  name: string;
  role: keyof typeof roleLabels;
  workspace: { name: string };
}) {
  const roleLabel = roleLabels[user.role];
  const identity = user.name === roleLabel ? roleLabel : `${user.name} · ${roleLabel}`;

  return `${identity} · ${user.workspace.name}`;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeReturnTo(firstParam(params.returnTo));
  const cookieStore = await cookies();
  const existingSession = await getValidAuthSession(cookieStore.get(sessionCookieName)?.value);

  if (existingSession) {
    redirect(returnTo);
  }

  const selectedProviderSlug = firstParam(params.provider);
  const selectedWorkspaceId = firstParam(params.workspaceId);
  const [providers, demoUsers] = await Promise.all([
    prisma.identityProvider.findMany({
      where: {
        type: {
          in: ["MICROSOFT_ENTRA_ID", "OIDC"]
        }
      },
      orderBy: [{ workspaceId: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        workspaceId: true,
        name: true,
        slug: true,
        status: true,
        type: true,
        workspace: {
          select: {
            name: true
          }
        }
      }
    }),
    isDemoAuthEnabled()
      ? prisma.user.findMany({
          where: {
            role: {
              not: "VIEWER"
            }
          },
          orderBy: [{ workspaceId: "asc" }, { role: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            workspace: {
              select: {
                name: true
              }
            }
          }
        })
      : Promise.resolve([])
  ]);
  const selectedProvider =
    providers.find(
      (provider) =>
        provider.slug === selectedProviderSlug &&
        (!selectedWorkspaceId || provider.workspaceId === selectedWorkspaceId)
    ) ?? providers[0] ?? null;
  const selectedProviderIsActive = selectedProvider?.status === "active";
  const authError = firstParam(params.authError);
  const loggedOut = firstParam(params.loggedOut) === "1";

  return (
    <section className="page-shell">
      <div className="mx-auto grid min-h-screen w-full max-w-5xl content-center gap-5 py-10">
        <div className="command-center">
          <div>
            <p className="page-kicker">Авторизация</p>
            <h1 className="page-title">Вход в систему</h1>
            <p className="page-subtitle">Единая точка входа для проверяющих, руководителей и операторов поддержки.</p>
          </div>
        </div>

        {authError ? (
          <div className="panel border-[#fecaca] bg-[#fff7f7] px-5 py-4 text-sm font-medium text-[#991b1b]">{authError}</div>
        ) : null}
        {loggedOut ? (
          <div className="panel border-[#bbf7d0] bg-[#f0fdf4] px-5 py-4 text-sm font-medium text-[#166534]">Сессия завершена.</div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="panel overflow-hidden">
            <div className="border-b border-[#d9e0ea] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0fdf4] text-[#166534]">
                  <UserRoundCheck size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-[#111827]">Вход по учетной записи</h2>
                  <p className="mt-1 text-sm text-[#64748b]">Основной вход для пользователей с назначенной ролью.</p>
                </div>
              </div>
            </div>
            <form action={signInWithLocalCredentials} className="grid gap-3 p-5">
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Логин
                <input name="login" autoComplete="username" required className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Пароль
                <input name="password" type="password" autoComplete="current-password" required className="form-control" />
              </label>
              <button type="submit" className="action-button action-button--primary">
                Войти
              </button>
            </form>

            {demoUsers.length > 0 ? (
              <details className="border-t border-[#d9e0ea]">
                <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-[#334155]">Демо-вход</summary>
                <form action={switchCurrentUser} className="grid gap-3 border-t border-[#d9e0ea] p-5">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <label className="grid gap-1 text-sm font-medium text-[#334155]">
                    Пользователь
                    <select name="userId" className="form-control">
                      {demoUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {demoUserOptionLabel(user)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="action-button">
                    Войти в демо-режиме
                  </button>
                </form>
              </details>
            ) : null}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-[#d9e0ea] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#edf2ff] text-[#1d3fae]">
                  <ShieldCheck size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-[#111827]">SSO</h2>
                  <p className="mt-1 text-sm text-[#64748b]">Отдельная опция для корпоративного провайдера.</p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-5">
              {selectedProvider ? (
                <>
                  <div className="record-card">
                    <div className="min-w-0">
                      <h3 className="record-title">{selectedProvider.name}</h3>
                      <p className="record-meta mt-1">
                        {selectedProvider.workspace.name} · {selectedProvider.type} ·{" "}
                        {providerStatusLabels[selectedProvider.status] ?? selectedProvider.status}
                      </p>
                    </div>
                    {selectedProviderIsActive ? (
                      <Link
                        href={ssoHref({
                          provider: selectedProvider.slug,
                          workspaceId: selectedProvider.workspaceId,
                          returnTo
                        })}
                        className="action-button"
                      >
                        Войти через SSO
                      </Link>
                    ) : (
                      <button type="button" className="action-button" disabled>
                        SSO недоступен
                      </button>
                    )}
                  </div>

                  {providers.length > 1 ? (
                    <div className="grid gap-2">
                      {providers.map((provider) => (
                        <Link
                          key={provider.id}
                          href={providerSelectionHref({
                            provider: provider.slug,
                            workspaceId: provider.workspaceId,
                            returnTo
                          })}
                          className={`record-card ${provider.id === selectedProvider.id ? "record-card--selected" : ""}`}
                        >
                          <div>
                            <h3 className="record-title">{provider.name}</h3>
                            <p className="record-meta mt-1">
                              {provider.workspace.name} · {providerStatusLabels[provider.status] ?? provider.status}
                            </p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-[#d9e0ea] p-5 text-sm text-[#64748b]">
                  SSO-провайдер пока не настроен.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
