"use client";

import { KeyRound, RotateCw, ShieldOff } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Chip } from "@/components/ui/chip";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

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
      <div className="ops-panel__header -m-5 mb-0">
        <div>
          <p className="ops-panel__eyebrow">Provisioning</p>
          <h2 id={titleId} className="ops-panel__title">SCIM 2.0 bearer token</h2>
          <p className="ops-panel__subtitle">
            Выпуск, ротация и отзыв токена входящего provisioning для выбранного провайдера.
          </p>
        </div>
        <Chip tone={hasToken ? "success" : "warning"} size="sm">
          {hasToken ? "Выпущен" : "Не выпущен"}
        </Chip>
      </div>

      <div className="ops-status-strip" aria-label={`SCIM-токен ${providerName}`}>
        <div className="ops-status-item">
          <span className="ops-status-item__label">Статус</span>
          <span className="ops-status-item__value">{hasToken ? "Токен выпущен" : "Токен не выпущен"}</span>
          <span className="record-meta compact-text">
            {tokenPrefix ? <span className="font-mono">{tokenPrefix}</span> : "Bearer-токен появится только один раз после выпуска или ротации."}
          </span>
        </div>
        <div className="ops-status-item">
          <span className="ops-status-item__label">SCIM base URL</span>
          <span className="ops-status-item__value font-mono text-sm compact-text">{scimBaseUrl}</span>
          <span className="record-meta">ServiceProviderConfig, Users и Groups находятся под этим путем.</span>
        </div>
      </div>

      <div className="admin-actions">
        <button
          type="button"
          className="action-button action-button--primary"
          disabled={hasToken || pendingAction !== null}
          onClick={() => void mutateToken("issue")}
        >
          <KeyRound size={16} aria-hidden="true" />
          {pendingAction === "issue" ? "Выпускаем..." : "Выпустить"}
        </button>
        <button
          type="button"
          className="action-button"
          disabled={!hasToken || pendingAction !== null}
          onClick={() => void mutateToken("rotate")}
        >
          <RotateCw size={16} aria-hidden="true" />
          {pendingAction === "rotate" ? "Ротируем..." : "Ротировать"}
        </button>
        <ConfirmSubmitButton
          className="action-button action-button--quiet"
          disabled={!hasToken || pendingAction !== null}
          confirmMessage={`Отозвать SCIM-токен для «${providerName}»? Входящий provisioning и синхронизация каталога остановятся, пока не будет выпущен новый токен.`}
          onClick={() => void mutateToken("revoke")}
        >
          <ShieldOff size={16} aria-hidden="true" />
          {pendingAction === "revoke" ? "Отзываем..." : "Отозвать"}
        </ConfirmSubmitButton>
      </div>

      {plainToken ? (
        <div className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-4 text-sm text-[var(--success)]">
          <div className="mb-3 font-semibold">Скопируйте SCIM bearer token сейчас. Повторно он не отображается.</div>
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{providerName}</span>
              <CopyButton value={plainToken} label="Скопировать токен" />
            </div>
            <code data-testid="created-scim-token-secret" className="inline-code-box compact-text">
              {plainToken}
            </code>
            {authorizationHeader ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="inline-code-box compact-text">{authorizationHeader}</code>
                <CopyButton value={authorizationHeader} label="Скопировать заголовок" />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-lg border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm font-medium text-[var(--success)]">{message}</div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm font-medium text-[var(--danger)]">{error}</div>
      ) : null}
    </div>
  );
}
