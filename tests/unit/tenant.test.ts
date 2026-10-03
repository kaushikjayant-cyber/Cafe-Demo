import { describe, expect, it } from "vitest";

import { parseTenantKey, routeRequest, tenantHref } from "@/lib/tenant";

const platformDomain = "cafeqr.in";
const route = (host: string, pathname: string) => routeRequest({ host, pathname, platformDomain });

describe("routeRequest on the platform host", () => {
  it("passes platform pages through", () => {
    expect(route("cafeqr.in", "/")).toEqual({ action: "next" });
    expect(route("www.cafeqr.in", "/super")).toEqual({ action: "next" });
    expect(route("localhost:3000", "/")).toEqual({ action: "next" });
  });

  it("resolves the /c/<slug> path fallback", () => {
    expect(route("localhost:3000", "/c/demo/staff")).toEqual({
      action: "next",
      tenantBase: "/c/demo",
      tenantKey: "demo",
    });
  });

  it("404s an invalid or reserved slug in the path", () => {
    expect(route("cafeqr.in", "/c/Bad_Slug")).toEqual({ action: "not_found" });
    expect(route("cafeqr.in", "/c/admin")).toEqual({ action: "not_found" });
    expect(route("cafeqr.in", "/c/")).toEqual({ action: "not_found" });
  });
});

describe("routeRequest on a cafe subdomain", () => {
  it("rewrites into the cafe's routes", () => {
    expect(route("bluebean.cafeqr.in", "/")).toEqual({
      action: "rewrite",
      pathname: "/c/bluebean",
      tenantBase: "",
      tenantKey: "bluebean",
    });
    expect(route("BlueBean.cafeqr.in:443", "/staff")).toMatchObject({ pathname: "/c/bluebean/staff" });
  });

  it("serves the demo cafe at demo.<platform>", () => {
    expect(route("demo.cafeqr.in", "/admin")).toMatchObject({ action: "rewrite", pathname: "/c/demo/admin" });
  });

  it("keeps QR and API routes shared", () => {
    expect(route("bluebean.cafeqr.in", "/t/abcdefgh23")).toEqual({ action: "next" });
    expect(route("bluebean.cafeqr.in", "/api/orders")).toEqual({ action: "next" });
  });

  it("blocks reaching other cafes or the super panel from a cafe host", () => {
    expect(route("bluebean.cafeqr.in", "/c/othercafe")).toEqual({ action: "not_found" });
    expect(route("bluebean.cafeqr.in", "/super")).toEqual({ action: "not_found" });
  });

  it("404s reserved and nested subdomains", () => {
    expect(route("api.cafeqr.in", "/")).toEqual({ action: "not_found" });
    expect(route("a.b.cafeqr.in", "/")).toEqual({ action: "not_found" });
  });
});

describe("routeRequest on a custom domain", () => {
  it("marks the domain for a database lookup", () => {
    expect(route("order.bluebean.in", "/menu")).toEqual({
      action: "rewrite",
      pathname: "/c/~order.bluebean.in/menu",
      tenantBase: "",
      tenantKey: "~order.bluebean.in",
    });
  });

  it("rejects garbage hosts", () => {
    expect(route("not a host", "/")).toEqual({ action: "not_found" });
    expect(route("", "/")).toEqual({ action: "not_found" });
  });
});

describe("parseTenantKey", () => {
  it("parses slugs and domains", () => {
    expect(parseTenantKey("demo")).toEqual({ slug: "demo" });
    expect(parseTenantKey("~order.bluebean.in")).toEqual({ domain: "order.bluebean.in" });
    expect(parseTenantKey("%7Eorder.bluebean.in")).toEqual({ domain: "order.bluebean.in" });
  });

  it("rejects anything else", () => {
    expect(parseTenantKey("www")).toBeNull();
    expect(parseTenantKey("~not a domain")).toBeNull();
    expect(parseTenantKey("UPPER")).toBeNull();
  });
});

describe("tenantHref", () => {
  it("prefixes links with the path base only in path mode", () => {
    expect(tenantHref("/c/demo", "/staff")).toBe("/c/demo/staff");
    expect(tenantHref("", "/staff")).toBe("/staff");
    expect(tenantHref("", "/")).toBe("/");
    expect(tenantHref("/c/demo", "/")).toBe("/c/demo");
  });
});
