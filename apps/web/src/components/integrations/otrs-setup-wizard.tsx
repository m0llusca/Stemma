"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import type { OtrsFamilySource } from "@/lib/normalizers/otrs-family";

const sourceOptions = [
  { value: "znuny", label: "Znuny" },
  { value: "otrs", label: "OTRS CE 6" },
  { value: "otobo", label: "OTOBO" },
  { value: "otrs_family", label: "OTRS-family" }
] as const satisfies ReadonlyArray<{ value: OtrsFamilySource; label: string }>;

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function OtrsSetupWizard() {
  const [source, setSource] = useState<OtrsFamilySource>("znuny");
  const [baseUrl, setBaseUrl] = useState("https://support.example.com/otrs");
  const [userLogin, setUserLogin] = useState("agent_login");
  const [password, setPassword] = useState("");
  const [ticketId, setTicketId] = useState("42");
  const [checked, setChecked] = useState(false);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const isReady = normalizedBaseUrl.startsWith("http") && userLogin.trim() !== "" && ticketId.trim() !== "";
  const genericInterfaceUrl = `${normalizedBaseUrl}/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/${encodeURIComponent(ticketId.trim() || "42")}`;
  const ticketGetRequest = useMemo(
    () =>
      JSON.stringify(
        {
          TicketGet: {
            UserLogin: userLogin.trim() || "agent_login",
            Password: password ? "[hidden]" : "[empty]",
            TicketID: ticketId.trim() || "42",
            Extended: 1,
            AllArticles: 1,
            ArticleOrder: "ASC",
            DynamicFields: 1,
            Attachments: 0
          }
        },
        null,
        2
      ),
    [password, ticketId, userLogin]
  );

  return (
    <section className="rounded-md border border-[#d7dce5] bg-[#f7f8fb] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#17202a]">Wizard подключения OTRS/Znuny</h3>
          <p className="mt-1 text-sm text-[#667085]">URL, auth, preflight TicketGet и sample-импорт в одной форме.</p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-[#0b4f52]">Preflight</span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Источник
            <select
              value={source}
              onChange={(event) => setSource(event.target.value as OtrsFamilySource)}
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            >
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Base URL
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            UserLogin
            <input
              value={userLogin}
              onChange={(event) => setUserLogin(event.target.value)}
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054]">
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-[#344054] md:col-span-2">
            TicketID для проверки
            <input
              value={ticketId}
              onChange={(event) => setTicketId(event.target.value)}
              className="rounded border border-[#d7dce5] bg-white px-3 py-2"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3 md:col-span-2">
            <button
              type="button"
              onClick={() => setChecked(true)}
              disabled={!isReady}
              className="inline-flex items-center gap-2 rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Проверить подключение
            </button>
            {checked && isReady ? (
              <span className="inline-flex items-center gap-2 text-sm font-medium text-[#116466]">
                <CheckCircle2 size={16} aria-hidden="true" />
                Preflight готов для {source}
              </span>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3">
          <div className="rounded border border-[#d7dce5] bg-white p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">GenericInterface URL</p>
            <code className="mt-2 block break-all text-xs text-[#344054]">{genericInterfaceUrl}</code>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase text-[#667085]">TicketGet request</p>
              <CopyButton value={ticketGetRequest} />
            </div>
            <pre className="max-h-[260px] overflow-auto rounded-md bg-[#17202a] p-4 text-xs leading-5 text-white">
              <code>{ticketGetRequest}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
