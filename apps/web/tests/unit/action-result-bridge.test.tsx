import "@testing-library/jest-dom/vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actionFlowNavigation,
  actionRedirectFromResponse,
  parseActionResultFromFlight,
  scheduleNavigationCommitFallback
} from "@/lib/action-result-bridge";
import { ActionFlowGuard } from "@/components/action-flow-guard";

// Real payload captured from a save action POST (Next 16.2.4).
const capturedFlight = [
  '0:{"a":"$@1","f":"","q":"?section=operations","i":false,"b":"VC0dAuupV-18FTOGWWugE"}',
  '1:{"ok":false,"message":"Демо-пользователи не могут сохранять настройки реального окружения."}'
].join("\n");

describe("parseActionResultFromFlight", () => {
  it("resolves the action result through a flight reference row", () => {
    expect(parseActionResultFromFlight(capturedFlight)).toEqual({
      ok: false,
      message: "Демо-пользователи не могут сохранять настройки реального окружения."
    });
  });

  it("reads an inlined action result without a reference hop", () => {
    const flight = '0:{"a":{"ok":true,"message":"Сохранено."},"f":""}';
    expect(parseActionResultFromFlight(flight)).toEqual({
      ok: true,
      message: "Сохранено."
    });
  });

  it("returns undefined for non-action payloads", () => {
    expect(parseActionResultFromFlight("")).toBeUndefined();
    expect(parseActionResultFromFlight('0:{"f":"abc"}')).toBeUndefined();
    expect(parseActionResultFromFlight("not flight at all")).toBeUndefined();
  });
});

describe("actionRedirectFromResponse", () => {
  function responseLike(init: {
    status?: number;
    redirected?: boolean;
    url?: string;
    headers?: Record<string, string>;
  }) {
    return {
      status: init.status ?? 200,
      redirected: init.redirected ?? false,
      url: init.url ?? "",
      headers: new Headers(init.headers)
    };
  }

  it("prefers the x-action-redirect header and strips the navigation kind", () => {
    expect(
      actionRedirectFromResponse(
        responseLike({
          status: 303,
          headers: { "x-action-redirect": "/reviews/conv-1;push" }
        })
      )
    ).toBe("/reviews/conv-1");
  });

  it("reads the location header of a 303", () => {
    expect(
      actionRedirectFromResponse(
        responseLike({ status: 303, headers: { location: "/reviews/conv-2" } })
      )
    ).toBe("/reviews/conv-2");
  });

  it("falls back to the final URL of a followed redirect", () => {
    expect(
      actionRedirectFromResponse(
        responseLike({ redirected: true, url: "http://localhost:3000/reviews/conv-3" })
      )
    ).toBe("http://localhost:3000/reviews/conv-3");
  });

  it("returns null for a plain 200", () => {
    expect(actionRedirectFromResponse(responseLike({}))).toBeNull();
  });
});

describe("ActionFlowGuard", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("delivers the parsed action result to the submitting form", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => {
      return new Response(capturedFlight, {
        status: 200,
        headers: { "content-type": "text/x-component" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onResult = vi.fn();
    render(
      <form>
        <ActionFlowGuard onResult={onResult} />
        <button type="submit">Сохранить</button>
      </form>
    );

    fireEvent.submit(currentForm());
    await window.fetch("/admin/integrations/x", {
      method: "POST",
      headers: { "Next-Action": "deadbeef" }
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({
        ok: false,
        message: "Демо-пользователи не могут сохранять настройки реального окружения."
      });
    });
  });

  it("forces a full navigation when a redirect commit never lands", async () => {
    vi.useFakeTimers();
    // Response constructors reject 3xx statuses, so the redirect response is
    // faked with the minimal surface the bridge reads.
    const fetchMock = vi.fn().mockImplementation(async () => ({
      status: 303,
      redirected: false,
      url: "",
      headers: new Headers({ location: "/reviews/conv-9" }),
      clone() {
        return this;
      },
      text: async () => ""
    }));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    const reload = vi.fn();
    const assignSpy = vi.spyOn(actionFlowNavigation, "assign").mockImplementation(assign);
    const reloadSpy = vi.spyOn(actionFlowNavigation, "reload").mockImplementation(reload);

    render(
      <form>
        <ActionFlowGuard />
        <button type="submit">Обновить</button>
      </form>
    );

    fireEvent.submit(currentForm());
    await window.fetch("/reviews/conv-9", {
      method: "POST",
      headers: { "Next-Action": "deadbeef" }
    });
    // Let the bridge's inspection microtask chain settle before advancing.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(assign).toHaveBeenCalledWith("/reviews/conv-9");
    expect(reload).not.toHaveBeenCalled();
    assignSpy.mockRestore();
    reloadSpy.mockRestore();
  });

  it("reloads in place when the redirect targets the current URL", async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/reviews/conv-9");
    const fetchMock = vi.fn().mockImplementation(async () => ({
      status: 303,
      redirected: false,
      url: "",
      headers: new Headers({ location: "/reviews/conv-9" }),
      clone() {
        return this;
      },
      text: async () => ""
    }));
    vi.stubGlobal("fetch", fetchMock);
    const assign = vi.fn();
    const reload = vi.fn();
    const assignSpy = vi.spyOn(actionFlowNavigation, "assign").mockImplementation(assign);
    const reloadSpy = vi.spyOn(actionFlowNavigation, "reload").mockImplementation(reload);

    render(
      <form>
        <ActionFlowGuard />
        <button type="submit">Обновить</button>
      </form>
    );

    fireEvent.submit(currentForm());
    await window.fetch("/reviews/conv-9", {
      method: "POST",
      headers: { "Next-Action": "deadbeef" }
    });
    // Let the bridge's inspection microtask chain settle before advancing.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
    assignSpy.mockRestore();
    reloadSpy.mockRestore();
  });
});

describe("scheduleNavigationCommitFallback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState(null, "", "/reviews");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("forces a full navigation when the address bar never reaches the target", async () => {
    const assign = vi
      .spyOn(actionFlowNavigation, "assign")
      .mockImplementation(vi.fn());

    scheduleNavigationCommitFallback("/reviews?status=unreviewed");
    await vi.advanceTimersByTimeAsync(2200);

    expect(assign).toHaveBeenCalledWith("/reviews?status=unreviewed");
  });

  it("cancels itself once the address bar reaches the target", async () => {
    const assign = vi
      .spyOn(actionFlowNavigation, "assign")
      .mockImplementation(vi.fn());

    scheduleNavigationCommitFallback("/reviews?status=unreviewed");
    await vi.advanceTimersByTimeAsync(400);
    window.history.replaceState(null, "", "/reviews?status=unreviewed");
    await vi.advanceTimersByTimeAsync(2200);

    expect(assign).not.toHaveBeenCalled();
  });
});

function currentForm(): HTMLFormElement {
  const element = document.querySelector("form");
  if (!element) throw new Error("form not rendered");
  return element;
}
