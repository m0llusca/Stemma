import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicBaseUrl } from "@/lib/net-guard";

const SSRF_MESSAGE = /приватный адрес сети|QC_ALLOW_PRIVATE_BASE_URLS/;

describe("assertPublicBaseUrl", () => {
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
  ])("blocks %s (%s)", (baseUrl) => {
    expect(() => assertPublicBaseUrl(new URL(baseUrl))).toThrow(SSRF_MESSAGE);
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
  ])("allows %s (%s)", (baseUrl) => {
    expect(() => assertPublicBaseUrl(new URL(baseUrl))).not.toThrow();
  });

  it("allows private addresses when QC_ALLOW_PRIVATE_BASE_URLS=1", () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");

    expect(() => assertPublicBaseUrl(new URL("http://169.254.169.254/"))).not.toThrow();
    expect(() => assertPublicBaseUrl(new URL("http://localhost:6379/"))).not.toThrow();
    expect(() => assertPublicBaseUrl(new URL("http://[::1]/"))).not.toThrow();
    expect(() => assertPublicBaseUrl(new URL("grpc://10.1.2.3:2136/local"))).not.toThrow();
  });

  it("keeps blocking when QC_ALLOW_PRIVATE_BASE_URLS has a non-enabling value", () => {
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "true");

    expect(() => assertPublicBaseUrl(new URL("http://10.0.0.5/"))).toThrow(SSRF_MESSAGE);
  });

  it("blocks localhost with a trailing dot", () => {
    expect(() => assertPublicBaseUrl(new URL("http://localhost./"))).toThrow(SSRF_MESSAGE);
  });

  it("mentions the on-prem override in the error message", () => {
    expect(() => assertPublicBaseUrl(new URL("http://192.168.0.1/"))).toThrow(/QC_ALLOW_PRIVATE_BASE_URLS=1/);
  });
});
