"use client";

import { KeyRound, RotateCw, ShieldOff } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { StatusBadge } from "@/components/ui/status-badge";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";

type ScimTokenManagerProps = {
  titleId: string;
  providerId: string;
  providerName: string;
  initialTokenPrefix: string | null;
  scimBaseUrl: string;
};

type ScimTokenResponse = {
  token?: {
    hasToken?: boolean;
    tokenPrefix?: string | null;
  };
  plainToken?: string;
  error?: {
    message?: string;
  };
};

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as ScimTokenResponse).error;
    if (typeof error?.message === "string" && error.message.trim()) {
      return error.message;
    }
  }

  return fallback;
}

export function ScimTokenManager({
  titleId,
  providerId,
  providerName,
  initialTokenPrefix,
  scimBaseUrl
}: ScimTokenManagerProps) {
  const [tokenPrefix, setTokenPrefix] = useState(initialTokenPrefix);
  const [plainToken, setPlainToken] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"issue" | "rotate" | "revoke" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasToken = Boolean(tokenPrefix);
  const authorizationHeader = plainToken ? `Authorization: Bearer ${plainToken}` : null;

  async function mutateToken(action: "issue" | "rotate" | "revoke") {
    setPendingAction(action);
    setMessage(null);
    setError(null);

    try {
      const method = action === "issue" ? "POST" : action === "rotate" ? "PATCH" : "DELETE";
      const response = await fetch(`/api/v1/auth/providers/${encodeURIComponent(providerId)}/scim-token`, {
        method,
        headers: {
          Accept: "application/json"
        }
      });
      const payload = (await response.json().catch(() => null)) as ScimTokenResponse | null;

      if (!response.ok) {
        setPlainToken(null);
        setError(errorMessage(payload, "Не удалось обновить SCIM-токен."));
        return;
      }

      const nextPrefix = payload?.token?.tokenPrefix ?? null;
      setTokenPrefix(nextPrefix);
      setPlainToken(action === "revoke" ? null : (payload?.plainToken ?? null));
      setMessage(
        action === "issue"
          ? "SCIM-токен выпущен."
          : action === "rotate"
            ? "SCIM-токен ротирован."
            : "SCIM-токен отозван."
      );
    } catch {
      setPlainToken(null);
      setError("Не удалось обновить SCIM-токен.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Синхронизация каталога
          </p>
          <h2 id={titleId} className="text-base font-medium leading-snug text-foreground">
            Bearer-токен SCIM 2.0
          </h2>
          <p className="text-sm text-muted-foreground">
            Выпуск, ротация и отзыв токена входящего provisioning для выбранного провайдера.
          </p>
        </div>
        <StatusBadge tone={hasToken ? "success" : "warning"}>
          {hasToken ? "Выпущен" : "Не выпущен"}
        </StatusBadge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Статус
          </span>
          <span className="text-sm font-medium text-foreground">
            {hasToken ? "Токен выпущен" : "Токен не выпущен"}
          </span>
          <span className="text-xs text-muted-foreground">
            {tokenPrefix ? (
              <span className="font-mono">{tokenPrefix}</span>
            ) : (
              "Bearer-токен появится только один раз после выпуска или ротации."
            )}
          </span>
        </div>
        <div className="grid gap-1 rounded-lg border border-border bg-muted/30 p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            SCIM base URL
          </span>
          <span className="break-all font-mono text-sm text-foreground">{scimBaseUrl}</span>
          <span className="text-xs text-muted-foreground">
            ServiceProviderConfig, Users и Groups находятся под этим путем.
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={hasToken || pendingAction !== null}
          onClick={() => void mutateToken("issue")}
        >
          <KeyRound data-icon="inline-start" aria-hidden="true" />
          {pendingAction === "issue" ? "Выпускаем..." : "Выпустить"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!hasToken || pendingAction !== null}
          onClick={() => void mutateToken("rotate")}
        >
          <RotateCw data-icon="inline-start" aria-hidden="true" />
          {pendingAction === "rotate" ? "Ротируем..." : "Ротировать"}
        </Button>
        <ConfirmSubmitButton
          className={cn(buttonVariants({ variant: "ghost", size: "default" }))}
          disabled={!hasToken || pendingAction !== null}
          confirmMessage={`Отозвать SCIM-токен для «${providerName}»? Входящий provisioning и синхронизация каталога остановятся, пока не будет выпущен новый токен.`}
          onClick={() => void mutateToken("revoke")}
        >
          <ShieldOff data-icon="inline-start" aria-hidden="true" />
          {pendingAction === "revoke" ? "Отзываем..." : "Отозвать"}
        </ConfirmSubmitButton>
      </div>

      {plainToken ? (
        <Alert className={cn("border-success/30", statusSurfaceClass("positive"))}>
          <AlertTitle>Скопируйте bearer-токен SCIM сейчас. Повторно он не отображается.</AlertTitle>
          <AlertDescription>
            <div className="mt-2 grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{providerName}</span>
                <CopyButton value={plainToken} label="Скопировать токен" />
              </div>
              <code
                data-testid="created-scim-token-secret"
                className="block break-all rounded-md border border-border bg-muted/50 px-2.5 py-2 font-mono text-xs text-foreground"
              >
                {plainToken}
              </code>
              {authorizationHeader ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="block break-all rounded-md border border-border bg-muted/50 px-2.5 py-2 font-mono text-xs text-foreground">
                    {authorizationHeader}
                  </code>
                  <CopyButton value={authorizationHeader} label="Скопировать заголовок" />
                </div>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {message ? (
        <Alert className={cn("border-success/30", statusSurfaceClass("positive"))}>
          <AlertDescription className="font-medium">{message}</AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
