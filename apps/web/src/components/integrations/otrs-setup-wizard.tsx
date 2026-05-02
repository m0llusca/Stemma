"use client";

import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  buildOtrsFamilyTicketGetQueryParams,
  buildOtrsFamilyTicketGetRequest,
  otrsFamilyProfileForSource,
  otrsFamilyRequestShapeNotes,
  otrsFamilySourceOptions,
  otrsFamilyTicketGetUrl,
  otrsFamilyUrlWithQuery,
  type OtrsFamilySource
} from "@/lib/normalizers/otrs-family";

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function OtrsSetupWizard() {
  const [source, setSource] = useState<OtrsFamilySource>("znuny");
  const [baseUrl, setBaseUrl] = useState<string>(otrsFamilyProfileForSource("znuny").exampleBaseUrl);
  const [userLogin, setUserLogin] = useState("agent_login");
  const [password, setPassword] = useState("");
  const [ticketId, setTicketId] = useState("42");
  const [checked, setChecked] = useState(false);
  const [useWrappedBody, setUseWrappedBody] = useState(false);
  const profile = otrsFamilyProfileForSource(source);
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const isReady = normalizedBaseUrl.startsWith("http") && userLogin.trim() !== "" && ticketId.trim() !== "";
  const ticketGetUrl = otrsFamilyTicketGetUrl(profile, ticketId.trim() || "42", normalizedBaseUrl);
  const ticketGetQueryUrl = otrsFamilyUrlWithQuery(
    ticketGetUrl,
    buildOtrsFamilyTicketGetQueryParams(profile, {
      userLogin: userLogin.trim() || "agent_login",
      password: password ? "[hidden]" : "[empty]",
      ticketId: ticketId.trim() || "42"
    })
  );
  const ticketGetCurl = [`curl -X ${profile.ticketGetMethod} "${ticketGetQueryUrl}"`, `  -H "Accept: application/json"`].join(
    " \\\n"
  );
  const ticketGetRequest = useMemo(
    () =>
      JSON.stringify(
        buildOtrsFamilyTicketGetRequest({
          userLogin: userLogin.trim() || "agent_login",
          password: password ? "[hidden]" : "[empty]",
          ticketId: ticketId.trim() || "42",
          wrapped: useWrappedBody
        }),
        null,
        2
      ),
    [password, ticketId, useWrappedBody, userLogin]
  );

  function updateSource(nextSource: OtrsFamilySource) {
    setSource(nextSource);
    setBaseUrl(otrsFamilyProfileForSource(nextSource).exampleBaseUrl);
    setChecked(false);
  }

  return (
    <section className="overflow-hidden rounded-md border border-[#d7dce5] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7dce5] bg-[#fbfcfd] px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase text-[#667085]">Preflight</p>
          <h3 className="mt-1 text-base font-semibold text-[#17202a]">Мастер подключения OTRS/Znuny</h3>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-[#667085]">
            Собирает URL, авторизацию и форму TicketGet для быстрой проверки перед импортом в QC.
          </p>
        </div>
        <span className="rounded-md border border-[#d7dce5] bg-white px-2 py-1 text-xs font-semibold text-[#0b4f52]">
          {profile.shortLabel}
        </span>
      </div>

      <div className="grid gap-4 p-4">
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid content-start gap-4 rounded-md border border-[#d7dce5] bg-white p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded bg-[#116466] text-xs font-semibold text-white">1</span>
              <h4 className="text-sm font-semibold text-[#17202a]">Параметры подключения</h4>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Источник
                <select
                  value={source}
                  onChange={(event) => updateSource(event.target.value as OtrsFamilySource)}
                  className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
                >
                  {otrsFamilySourceOptions.map((option) => (
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
                  className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                UserLogin
                <input
                  value={userLogin}
                  onChange={(event) => setUserLogin(event.target.value)}
                  className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Password
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                TicketID для проверки
                <input
                  value={ticketId}
                  onChange={(event) => setTicketId(event.target.value)}
                  className="w-full min-w-0 rounded border border-[#d7dce5] bg-white px-3 py-2"
                />
              </label>
              <label className="flex min-h-[42px] items-center gap-2 rounded border border-[#d7dce5] bg-[#fbfcfd] px-3 text-sm text-[#344054]">
                <input
                  type="checkbox"
                  checked={useWrappedBody}
                  onChange={(event) => setUseWrappedBody(event.target.checked)}
                />
                <span className="min-w-0">
                  Вложенное тело <span className="font-mono text-xs">{"{ TicketGet: { ... } }"}</span>
                </span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setChecked(true)}
                disabled={!isReady}
                className="inline-flex items-center justify-center gap-2 rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                Проверить подключение
              </button>
              {checked && isReady ? (
                <span className="inline-flex items-center gap-2 rounded-md bg-[#e8f3ef] px-3 py-2 text-sm font-medium text-[#116466]">
                  <CheckCircle2 size={16} aria-hidden="true" />
                  Preflight готов для {source}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid content-start gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded bg-[#17202a] text-xs font-semibold text-white">2</span>
              <h4 className="text-sm font-semibold text-[#17202a]">Запрос к helpdesk</h4>
            </div>
            <div className="rounded border border-[#d7dce5] bg-white p-3">
              <p className="text-xs font-semibold uppercase text-[#667085]">Канонический TicketGet URL</p>
              <code className="mt-2 block break-all text-xs text-[#344054]">{ticketGetQueryUrl}</code>
            </div>
            <div className="rounded border border-[#d7dce5] bg-white p-3">
              <p className="text-xs font-semibold uppercase text-[#667085]">Web Service</p>
              <p className="mt-2 text-xs leading-5 text-[#344054]">
                {profile.webService}; {profile.ticketGetMethod} {profile.ticketGetPath}. Если в админке route переименован,
                замените этот сегмент в URL.
              </p>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <div className="min-w-0 rounded-md border border-[#d7dce5] bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase text-[#667085]">Канонический GET curl</p>
              <CopyButton value={ticketGetCurl} />
            </div>
            <pre className="max-h-[180px] overflow-auto rounded-md bg-[#17202a] p-4 text-xs leading-5 text-white">
              <code>{ticketGetCurl}</code>
            </pre>
          </div>
          <div className="min-w-0 rounded-md border border-[#d7dce5] bg-white p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase text-[#667085]">Fallback JSON body</p>
              <CopyButton value={ticketGetRequest} />
            </div>
            <pre className="max-h-[260px] overflow-auto rounded-md bg-[#17202a] p-4 text-xs leading-5 text-white">
              <code>{ticketGetRequest}</code>
            </pre>
          </div>
        </div>
      </div>

      <div className="border-t border-[#d7dce5] bg-[#f7f8fb] p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded bg-[#667085] text-xs font-semibold text-white">3</span>
          <h4 className="text-sm font-semibold text-[#17202a]">Как читать форму запроса</h4>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {otrsFamilyRequestShapeNotes.map((note) => (
            <div key={note.title} className="rounded border border-[#d7dce5] bg-white p-3">
              <p className="text-sm font-semibold text-[#17202a]">{note.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#667085]">{note.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
