import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dnsMocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  resolve4: vi.fn(),
  resolve6: vi.fn()
}));

vi.mock("node:dns/promises", () => ({
  default: {
    lookup: dnsMocks.lookup,
    resolve4: dnsMocks.resolve4,
    resolve6: dnsMocks.resolve6
  },
  lookup: dnsMocks.lookup,
  resolve4: dnsMocks.resolve4,
  resolve6: dnsMocks.resolve6
}));

import { assertPublicBaseUrl, resolvePublicBaseUrl } from "@/lib/net-guard";

const SSRF_MESSAGE = /приватный адрес сети|QC_ALLOW_PRIVATE_BASE_URLS/;

describe("assertPublicBaseUrl", () => {
  beforeEach(() => {
    dnsMocks.lookup.mockReset();
    dnsMocks.resolve4.mockReset();
    dnsMocks.resolve6.mockReset();
    // Public hostnames resolve to a public address unless a test overrides.
    dnsMocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["http://10.0.0.5/api", "10.0.0.0/8"],
    ["http://127.0.0.1:8080/", "loopback 127.0.0.0/8"],
    ["http://127.255.255.254/", "loopback upper bound"],
    ["http://169.254.169.254/latest/meta-data", "link-local metadata endpoint"],
    ["http://172.16.0.1/", "172.16.0.0/12 lower bound"],
    ["http://172.31.255.255/", "172.16.0.0/12 upper bound"],
    ["http://192.168.1.10/", "192.168.0.0/16"],
    ["http://0.0.0.0/", "0.0.0.0/8"],
    ["http://100.64.0.1/", "CGNAT 100.64.0.0/10"],
    ["http://224.0.0.1/", "multicast 224.0.0.0/4"],
    ["http://240.0.0.1/", "reserved 240.0.0.0/4"],
    ["http://255.255.255.255/", "broadcast"],
    ["http://localhost:6379/", "localhost"],
    ["http://api.localhost/", "*.localhost"],
    ["http://[::1]/", "IPv6 loopback"],
    ["http://[::]/", "IPv6 unspecified"],
    ["http://[fc00::1]/", "IPv6 unique local fc00::/7"],
    ["http://[fdab:1234::1]/", "IPv6 unique local fd00::"],
    ["http://[fe80::1]/", "IPv6 link-local fe80::/10"],
    ["http://[::ffff:10.0.0.1]/", "IPv4-mapped private address"],
    ["http://[::ffff:169.254.169.254]/", "IPv4-mapped metadata address"],
    ["http://[::ffff:192.168.0.1]/", "IPv4-mapped private address (dotted form)"],
    ["grpc://[::ffff:c0a8:1]:2136/local", "grpc IPv4-mapped private address (hex form)"],
    ["grpc://127.1:2136/local", "grpc shorthand loopback (opaque host)"],
    ["grpc://0x7f000001:2136/local", "grpc hex IPv4 literal (opaque host)"],
    ["grpc://2130706433:2136/local", "grpc decimal IPv4 literal (opaque host)"],
    ["grpc://localhost:2136/local", "grpc localhost (opaque host)"]
  ])("blocks %s (%s)", async (baseUrl) => {
    await expect(assertPublicBaseUrl(new URL(baseUrl))).rejects.toThrow(SSRF_MESSAGE);
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it.each([
    ["https://support.example.com/otrs", "public hostname"],
    ["http://helpdesk.corp-cloud.io:8443/api", "public hostname with port"],
    ["https://8.8.8.8/", "public IPv4"],
    ["http://172.15.0.1/", "just below 172.16.0.0/12"],
    ["http://172.32.0.1/", "just above 172.16.0.0/12"],
    ["http://100.63.0.1/", "just below CGNAT range"],
    ["http://100.128.0.1/", "just above CGNAT range"],
    ["https://[2001:db8::1]/", "public IPv6"],
    ["http://[::ffff:8.8.8.8]/", "IPv4-mapped public address"],
    ["http://[2001:db8::127.0.0.1]/", "public IPv6 with embedded IPv4 tail"],
    ["grpc://ydb.example.com:2136/local", "grpc endpoint with public hostname"]
  ])("allows %s (%s)", async (baseUrl) => {
    await expect(assertPublicBaseUrl(new URL(baseUrl))).resolves.toBeUndefined();
  });

  it("allows private addresses when QC_ALLOW_PRIVATE_BASE_URLS=1", async () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");

    await expect(assertPublicBaseUrl(new URL("http://169.254.169.254/"))).resolves.toBeUndefined();
    await expect(assertPublicBaseUrl(new URL("http://localhost:6379/"))).resolves.toBeUndefined();
    await expect(assertPublicBaseUrl(new URL("http://[::1]/"))).resolves.toBeUndefined();
    await expect(assertPublicBaseUrl(new URL("grpc://10.1.2.3:2136/local"))).resolves.toBeUndefined();
    expect(dnsMocks.lookup).not.toHaveBeenCalled();
  });

  it("keeps blocking when QC_ALLOW_PRIVATE_BASE_URLS has a non-enabling value", async () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "true");

    await expect(assertPublicBaseUrl(new URL("http://10.0.0.5/"))).rejects.toThrow(SSRF_MESSAGE);
  });

  it("blocks localhost with a trailing dot", async () => {
    await expect(assertPublicBaseUrl(new URL("http://localhost./"))).rejects.toThrow(SSRF_MESSAGE);
  });

  it("mentions the on-prem override in the error message", async () => {
    await expect(assertPublicBaseUrl(new URL("http://192.168.0.1/"))).rejects.toThrow(/QC_ALLOW_PRIVATE_BASE_URLS=1/);
  });

  it("allows a public hostname when DNS resolves to a public address", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }]);

    const resolved = await resolvePublicBaseUrl(new URL("https://cdn.example.com/api"));

    expect(resolved.addresses).toEqual(["1.1.1.1"]);
    expect(dnsMocks.lookup).toHaveBeenCalledWith("cdn.example.com", { all: true, verbatim: true });
  });

  it("rejects a hostname that resolves to 127.0.0.1 (DNS rebinding)", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    await expect(assertPublicBaseUrl(new URL("https://evil.example.com/"))).rejects.toThrow(SSRF_MESSAGE);
  });

  it("rejects a hostname that resolves to 169.254.169.254 (metadata)", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);

    await expect(assertPublicBaseUrl(new URL("https://meta.example.com/"))).rejects.toThrow(SSRF_MESSAGE);
  });

  it("rejects when any of multiple resolved addresses is private", async () => {
    dnsMocks.lookup.mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 }
    ]);

    await expect(assertPublicBaseUrl(new URL("https://mixed.example.com/"))).rejects.toThrow(SSRF_MESSAGE);
  });

  it("rejects when DNS resolution fails for a hostname", async () => {
    dnsMocks.lookup.mockRejectedValueOnce(Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" }));
    dnsMocks.resolve4.mockRejectedValueOnce(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));
    dnsMocks.resolve6.mockRejectedValueOnce(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }));

    await expect(assertPublicBaseUrl(new URL("https://missing.example.com/"))).rejects.toThrow(/Не удалось разрешить DNS-имя/);
  });
});
