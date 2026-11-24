import { afterEach, describe, expect, it, vi } from "vitest";
import { apolloReveal, apolloSearch, apolloSearchUrl } from "@/lib/sources/apollo";
import { hunterSearch } from "@/lib/sources/hunter";
import { mapPlaces } from "@/lib/sources/outscraper";
import { providerFetch } from "@/lib/sources/http";
import { foundToRow } from "@/lib/import-core";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe("Apollo", () => {
  it("builds the api_search query with array params", () => {
    const url = new URL(apolloSearchUrl({ titles: "CEO, مدير التسويق", locations: "Riyadh", domains: "https://www.acme.com/x", seniorities: ["owner"], employees: ["1,10"], emailStatus: "verified", perPage: 500 }));
    expect(url.pathname).toBe("/api/v1/mixed_people/api_search");
    expect(url.searchParams.getAll("person_titles[]")).toEqual(["CEO", "مدير التسويق"]);
    expect(url.searchParams.getAll("q_organization_domains_list[]")).toEqual(["acme.com"]);
    expect(url.searchParams.getAll("organization_num_employees_ranges[]")).toEqual(["1,10"]);
    expect(url.searchParams.getAll("contact_email_status[]")).toEqual(["verified"]);
    expect(url.searchParams.get("per_page")).toBe("100");
  });
  it("maps search results (no emails, needs reveal) and sends x-api-key", async () => {
    const f = mockFetch(200, { total_entries: 42, people: [{ id: "p1", first_name: "Sara", last_name_obfuscated: "Ah***d", title: "CEO", has_email: true, organization: { name: "Acme" } }] });
    const r = await apolloSearch("KEY", { titles: "CEO" });
    expect(r.total).toBe(42);
    expect(r.items[0]).toMatchObject({ key: "p1", contactName: "Sara Ah***d", company: "Acme", needsReveal: true, hasEmail: true, email: "" });
    expect((f.mock.calls[0][1]!.headers as Record<string, string>)["x-api-key"]).toBe("KEY");
  });
  it("reveals in chunks of 10 and drops locked placeholder emails", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      const details = JSON.parse(String(init!.body)).details as { id: string }[];
      return new Response(JSON.stringify({
        credits_consumed: details.length,
        matches: details.map((d, i) => (i === 0 ? null : { id: d.id, name: `N ${d.id}`, email: d.id === "p2" ? "email_not_unlocked@acme.com" : `${d.id}@acme.com`, organization: { name: "Acme", primary_domain: "acme.com" } })),
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const r = await apolloReveal("K", ids);
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.credits).toBe(12);
    expect(r.missing).toBe(2); // one null per chunk
    expect(r.items.find((x) => x.key === "p2")!.email).toBe("");
    expect(r.items.find((x) => x.key === "p3")).toMatchObject({ email: "p3@acme.com", website: "https://acme.com", needsReveal: false });
  });
});

describe("Hunter", () => {
  it("maps domain search and filters by confidence", async () => {
    const f = mockFetch(200, {
      data: { domain: "acme.com", organization: "Acme", emails: [
        { value: "Ali@acme.com", confidence: 95, first_name: "Ali", last_name: "H", position: "CEO", type: "personal", verification: { status: "valid" } },
        { value: "x@acme.com", confidence: 30 },
      ] },
      meta: { results: 2 },
    });
    const r = await hunterSearch("K", { domain: "https://www.acme.com/about", type: "personal", minConfidence: 70 });
    const url = new URL(f.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/domain-search");
    expect(url.searchParams.get("domain")).toBe("acme.com");
    expect(url.searchParams.get("type")).toBe("personal");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ email: "ali@acme.com", contactName: "Ali H", title: "CEO", website: "https://acme.com", confidence: 95 });
  });
});

describe("Outscraper", () => {
  it("maps places (list of lists) and finds enrichment emails", () => {
    const items = mapPlaces([[{ name: "مطعم", place_id: "g1", phone: "+966", site: "https://m.sa", city: "Riyadh", category: "Restaurant", email_1: "Info@M.sa", rating: 4.5 }, { name: "بدون", place_id: "g2" }]]);
    expect(items[0]).toMatchObject({ key: "g1", company: "مطعم", email: "info@m.sa", website: "https://m.sa", industry: "Restaurant", hasEmail: true });
    expect(items[1].email).toBe("");
  });
});

describe("provider errors", () => {
  it("maps status codes to friendly codes", async () => {
    mockFetch(401, "Invalid API key");
    await expect(providerFetch("apollo", "https://x")).rejects.toMatchObject({ code: "source_auth" });
    mockFetch(403, { error_code: "API_INACCESSIBLE" });
    await expect(providerFetch("apollo", "https://x")).rejects.toMatchObject({ code: "source_forbidden" });
    mockFetch(403, { errors: [{ id: "too_many_requests" }] });
    await expect(providerFetch("hunter", "https://x")).rejects.toMatchObject({ code: "source_rate" });
    mockFetch(422, { error: "Invalid parameters" });
    await expect(providerFetch("apollo", "https://x")).rejects.toMatchObject({ code: "source_params" });
    mockFetch(429, "slow down");
    await expect(providerFetch("apollo", "https://x")).rejects.toMatchObject({ code: "source_rate" });
  });
  it("turns a found result into a contacts row", () => {
    expect(foundToRow({ key: "k", company: "Acme", contactName: "Ali", title: "CEO", email: "a@acme.com", phone: "", website: "https://acme.com", industry: "", city: "Riyadh", country: "", linkedin: "https://linkedin.com/in/a", hasEmail: true, needsReveal: false }, "Apollo"))
      .toEqual({ Company: "Acme", "Contact Name": "Ali", Title: "CEO", Email: "a@acme.com", Website: "https://acme.com", City: "Riyadh", Source: "Apollo", Notes: "https://linkedin.com/in/a" });
  });
});

describe("Hunter plan limit", () => {
  it("retries with limit 10 on pagination_error and flags it", async () => {
    const f = vi.fn(async (url: string) => {
      const limit = new URL(url).searchParams.get("limit");
      if (limit !== "10")
        return new Response(JSON.stringify({ errors: [{ id: "pagination_error", code: 400, details: "The search results are limited to 10 email addresses on your current plan." }] }), { status: 400 });
      return new Response(JSON.stringify({ data: { domain: "d.org", organization: "D", emails: [{ value: "a@d.org", confidence: 90 }] }, meta: { results: 1 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", f);
    const r = await hunterSearch("K", { domain: "d.org", limit: 50 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(r.planLimited).toBe(10);
    expect(r.items[0].email).toBe("a@d.org");
  });
});

describe("Hunter Discover (keywords)", async () => {
  const { hunterDiscover } = await import("@/lib/sources/hunter");
  it("posts keywords + location and maps companies", async () => {
    const f = vi.fn(async (_u: string, _init?: RequestInit) => new Response(JSON.stringify({
      data: [{ domain: "Acme.sa", organization: "Acme", emails_count: { personal: 7, generic: 2, total: 9 } }, { organization: "no domain" }],
      meta: { results: 120 },
    }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await hunterDiscover("K", { keywords: ["real estate", " dental "], country: "SA", city: "Riyadh", headcount: ["11-50"], limit: 500 });
    expect(f.mock.calls[0][0]).toBe("https://api.hunter.io/v2/discover");
    const body = JSON.parse(String(f.mock.calls[0][1]!.body));
    expect(body).toEqual({
      limit: 100,
      keywords: { include: ["real estate", "dental"], match: "any" },
      headquarters_location: { include: [{ country: "SA", city: "Riyadh" }] },
      headcount: ["11-50"],
    });
    expect(r.total).toBe(120);
    expect(r.companies).toEqual([{ domain: "acme.sa", name: "Acme", emails: 9, personal: 7, generic: 2 }]);
  });
});
