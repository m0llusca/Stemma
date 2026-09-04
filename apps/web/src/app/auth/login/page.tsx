import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { demoLoginUserOrderBy, demoLoginUserWhere } from "@/lib/auth/demo-users";
import { loginFlashCookieName, resolveLoginFlashMessage } from "@/lib/auth/login-flash";
import { resolvePostLoginPath, sanitizeReturnTo } from "@/lib/auth/role-home";
import { getValidAuthSession, sessionCookieName } from "@/lib/auth/session";
import { isDemoAuthEnabled } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
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
  // Missing returnTo stays generic (`/`) so post-login role home applies.
  return value == null || value === "" ? "/" : sanitizeReturnTo(value);
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
    redirect(resolvePostLoginPath(returnTo, existingSession.user));
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
    <section
      className={cn(
        "auth-shell flex min-h-dvh items-center justify-center bg-background p-6 sm:p-10"
      )}
    >
      <Card className="w-full max-w-[408px]">
        <CardHeader className="gap-2">
          <div className="mb-1 flex items-center gap-2.5">
            <span
              className="inline-flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-foreground">Stemma</span>
          </div>
          <CardTitle
            role="heading"
            aria-level={1}
            className="text-[21px] font-semibold tracking-tight"
          >
            Вход в систему
          </CardTitle>
          <CardDescription className="text-pretty">
            Единая точка входа для проверяющих, руководителей и операторов поддержки.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          {authError ? (
            <Alert variant="destructive">
              <AlertDescription>{authError}</AlertDescription>
            </Alert>
          ) : null}
          {loggedOut ? (
            <Alert>
              <CheckCircle2 className="text-emerald-700 dark:text-emerald-300" />
              <AlertDescription className="text-emerald-800 dark:text-emerald-300">
                Сессия завершена.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Вход по учетной записи
            </h2>
            <form action={signInWithLocalCredentials}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <FieldGroup className="gap-3.5">
                <Field>
                  <FieldLabel htmlFor="login">Логин</FieldLabel>
                  <Input
                    id="login"
                    name="login"
                    autoComplete="username"
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Пароль</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Button type="submit" className="mt-1 w-full">
                  Войти
                </Button>
              </FieldGroup>
            </form>
          </div>

          {selectedProvider ? (
            <>
              <Separator />
              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  SSO
                </h2>
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-3.5 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-medium text-foreground">
                        <span className="text-sm break-words">{selectedProvider.name}</span>
                        <Chip tone={selectedProviderIsActive ? "success" : "neutral"}>
                          {providerStatusLabels[selectedProvider.status] ?? selectedProvider.status}
                        </Chip>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground break-words">
                        {selectedProvider.workspace.name} · {selectedProvider.type}
                      </p>
                    </div>
                    {selectedProviderIsActive ? (
                      <Button
                        render={
                          <Link
                            href={ssoHref({
                              provider: selectedProvider.slug,
                              workspaceId: selectedProvider.workspaceId,
                              returnTo
                            })}
                          />
                        }
                        nativeButton={false}
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                      >
                        Войти через SSO
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" className="shrink-0" disabled>
                        SSO недоступен
                      </Button>
                    )}
                  </div>

                  {providers.length > 1 ? (
                    <div className="flex flex-col gap-2">
                      {providers
                        .filter((provider) => provider.id !== selectedProvider.id)
                        .map((provider) => (
                          <Link
                            key={provider.id}
                            href={providerSelectionHref({
                              provider: provider.slug,
                              workspaceId: provider.workspaceId,
                              returnTo
                            })}
                            className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="text-sm font-medium text-foreground break-words">
                              {provider.name}
                            </span>
                            <span className="text-xs text-muted-foreground break-words">
                              {provider.workspace.name} ·{" "}
                              {providerStatusLabels[provider.status] ?? provider.status}
                            </span>
                          </Link>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </CardContent>

        {demoUsers.length > 0 ? (
          <CardFooter className="flex-col items-stretch">
            <Collapsible className="w-full">
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <UserRoundCheck className="size-3.5 text-muted-foreground" aria-hidden="true" />
                Демо-вход
              </CollapsibleTrigger>
              <CollapsibleContent keepMounted>
                <form action={signInWithDemoUser} className="mt-3.5">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <FieldGroup className="gap-3.5">
                    <Field>
                      <FieldLabel htmlFor="demo-user">Пользователь</FieldLabel>
                      <NativeSelect id="demo-user" name="userId" className="w-full">
                        {demoUsers.map((user) => (
                          <NativeSelectOption key={user.id} value={user.id}>
                            {demoUserOptionLabel(user)}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                    <Button type="submit" variant="secondary" className="w-full">
                      Войти в демо-режиме
                    </Button>
                  </FieldGroup>
                </form>
              </CollapsibleContent>
            </Collapsible>
          </CardFooter>
        ) : null}
      </Card>
    </section>
  );
}
