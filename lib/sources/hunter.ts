// Hunter.io Domain Search: emails of people at a company domain. Docs: https://hunter.io/api-documentation/v2
import { isAppError } from "../errors";
import { providerFetch, str } from "./http";
import type { HunterFilters, SearchResult } from "./types";

const BASE = "https://api.hunter.io/v2";

type HunterEmail = {
  value: string; type?: string; confidence?: number; first_name?: string | null; last_name?: string | null; position?: string | null;
  seniority?: string | null; department?: string | null; linkedin?: string | null; phone_number?: string | null;
  verification?: { status?: string | null } | null;
};

export async function hunterSearch(key: string, f: HunterFilters): Promise<SearchResult> {
  try {
    return await hunterSearchOnce(key, f);
  } catch (e) {
    // Free/low plans cap limit + offset at 10 ("pagination_error"): retry within the plan's cap.
    if (isAppError(e, "source_params") && /pagination_error/.test(e.detail || "") && (f.limit ?? 25) + (f.offset ?? 0) > 10) {
      const r = await hunterSearchOnce(key, { ...f, limit: 10, offset: 0 });
      return { ...r, planLimited: 10 };
    }
    throw e;
  }
}

async function hunterSearchOnce(key: string, f: HunterFilters): Promise<SearchResult> {
  const q = new URLSearchParams();
  const domain = str(f.domain).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (domain) q.set("domain", domain);
  else if (f.company?.trim()) q.set("company", f.company.trim());
  q.set("limit", String(Math.min(100, Math.max(1, f.limit || 25))));
  q.set("offset", String(Math.max(0, f.offset || 0)));
  if (f.type && f.type !== "all") q.set("type", f.type);
  if (f.seniority?.length) q.set("seniority", f.seniority.join(","));
  if (f.department?.length) q.set("department", f.department.join(","));
  const r = await providerFetch<{
    data?: { domain?: string; organization?: string; industry?: string; country?: string; city?: string; emails?: HunterEmail[] };
    meta?: { results?: number };
  }>("hunter", `${BASE}/domain-search?${q.toString()}`, { headers: { "X-API-KEY": key } });
  const d = r.data || {};
  const min = f.minConfidence ?? 0;
  const items = (d.emails || [])
    .filter((e) => (e.confidence ?? 100) >= min)
    .map((e) => ({
      key: e.value,
      company: str(d.organization),
      contactName: [str(e.first_name), str(e.last_name)].filter(Boolean).join(" "),
      title: str(e.position),
      email: str(e.value).toLowerCase(),
      phone: str(e.phone_number),
      website: d.domain ? `https://${d.domain}` : "",
      industry: str(d.industry),
      city: str(d.city),
      country: str(d.country),
      linkedin: str(e.linkedin),
      hasEmail: true,
      needsReveal: false,
      confidence: e.confidence,
      extra: [e.type, e.verification?.status].filter(Boolean).join(" · ") || undefined,
    }));
  return { items, total: r.meta?.results, info: d.organization ? `${d.organization} (${d.domain})` : undefined };
}

export async function hunterTest(key: string): Promise<string> {
  const r = await providerFetch<{ data?: { plan_name?: string; requests?: Record<string, { used?: number; available?: number }> } }>(
    "hunter",
    `${BASE}/account`,
    { headers: { "X-API-KEY": key } },
  );
  const req = r.data?.requests || {};
  const pool = req.credits || req.searches;
  return `${r.data?.plan_name || "Hunter"}${pool ? ` — ${pool.used ?? 0}/${pool.available ?? "?"}` : ""}`;
}
