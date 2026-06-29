import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, UserRoundCheck } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { demoLoginUserOrderBy, demoLoginUserWhere } from "@/lib/auth/demo-users";
import { loginFlashCookieName, resolveLoginFlashMessage } from "@/lib/auth/login-flash";
import { getValidAuthSession, sessionCookieName } from "@/lib/auth/session";
import { isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { signInWithDemoUser, signInWithLocalCredentials } from "@/lib/user-actions";

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
  const demoAuthEnabled = isDemoAuthEnabled();
  const [providers, demoUsers] = await Promise.all([
    prisma.identityProvider.findMany({
      where: {
        type: {
          in: ["MICROSOFT_ENTRA_ID", "OIDC", "SAML"]
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
    demoAuthEnabled
      ? prisma.user.findMany({
          where: demoLoginUserWhere,
          orderBy: demoLoginUserOrderBy,
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
  const authError = resolveLoginFlashMessage(cookieStore.get(loginFlashCookieName)?.value);
  const loggedOut = firstParam(params.loggedOut) === "1";

  return (
    <section className="auth-shell">
      <div className="auth-card">
        <header className="auth-card__head">
          <span className="auth-brand">
            <span className="auth-brand__mark" aria-hidden="true">
              <ShieldCheck size={18} />
            </span>
            <span className="auth-brand__wordmark">Stemma</span>
          </span>
          <h1 className="auth-title">Вход в систему</h1>
          <p className="auth-subtitle">Единая точка входа для проверяющих, руководителей и операторов поддержки.</p>
        </header>

        {authError ? (
          <p className="auth-alert auth-alert--danger" role="alert">
            {authError}
          </p>
        ) : null}
        {loggedOut ? (
          <p className="auth-alert auth-alert--success" role="status">
            Сессия завершена.
          </p>
        ) : null}

        <h2 className="auth-section-title">Вход по учетной записи</h2>
        <form action={signInWithLocalCredentials} className="auth-form">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label className="auth-field">
            <span className="auth-field__label">Логин</span>
            <input name="login" autoComplete="username" required className="form-control" />
          </label>
          <label className="auth-field">
            <span className="auth-field__label">Пароль</span>
            <input name="password" type="password" autoComplete="current-password" required className="form-control" />
          </label>
          <button type="submit" className="action-button action-button--primary auth-submit">
            Войти
          </button>
        </form>

        {selectedProvider ? (
          <div className="auth-section">
            <h2 className="auth-section-title">
              <ShieldCheck size={14} aria-hidden="true" />
              SSO
            </h2>
            <div className="auth-sso">
              <div className="auth-sso__head">
                <div className="min-w-0">
                  <h2 className="auth-sso__name">
                    {selectedProvider.name}
                    <Chip tone={selectedProviderIsActive ? "success" : "neutral"} size="xs">
                      {providerStatusLabels[selectedProvider.status] ?? selectedProvider.status}
                    </Chip>
                  </h2>
                  <p className="auth-sso__meta">
                    {selectedProvider.workspace.name} · {selectedProvider.type}
                  </p>
                </div>
                {selectedProviderIsActive ? (
                  <Link
                    href={ssoHref({
                      provider: selectedProvider.slug,
                      workspaceId: selectedProvider.workspaceId,
                      returnTo
                    })}
                    className="action-button auth-sso__action"
                  >
                    Войти через SSO
                  </Link>
                ) : (
                  <button type="button" className="action-button auth-sso__action" disabled>
                    SSO недоступен
                  </button>
                )}
              </div>

              {providers.length > 1 ? (
                <div className="auth-provider-list">
                  {providers.map((provider) => (
                    <Link
                      key={provider.id}
                      href={providerSelectionHref({
                        provider: provider.slug,
                        workspaceId: provider.workspaceId,
                        returnTo
                      })}
                      aria-current={provider.id === selectedProvider.id ? "true" : undefined}
                      className={`auth-provider ${provider.id === selectedProvider.id ? "auth-provider--selected" : ""}`}
                    >
                      <span className="auth-provider__name">{provider.name}</span>
                      <span className="auth-provider__meta">
                        {provider.workspace.name} · {providerStatusLabels[provider.status] ?? provider.status}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {demoUsers.length > 0 ? (
          <details className="auth-demo">
            <summary className="auth-demo__summary">
              <UserRoundCheck size={14} aria-hidden="true" />
              Демо-вход
            </summary>
            <form action={signInWithDemoUser} className="auth-form auth-demo__form">
              <input type="hidden" name="returnTo" value={returnTo} />
              <label className="auth-field">
                <span className="auth-field__label">Пользователь</span>
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
      </div>
    </section>
  );
}
