// Outscraper Google Maps search (businesses by category + city). Endpoint per the official SDK: POST /google-maps-search.
import { providerFetch, str } from "./http";
import type { Found, OutscraperFilters, SearchResult } from "./types";

const BASE = "https://api.app.outscraper.com";

type Place = Record<string, unknown>;
type Resp = { id?: string; status?: string; data?: Place[][] | Place[] };

function firstEmail(p: Place): string {
  for (const [k, v] of Object.entries(p)) {
    if (/^email(_\d+)?$/i.test(k) && typeof v === "string" && v.includes("@")) return v.toLowerCase().trim();
  }
  const list = p.emails;
  if (Array.isArray(list)) for (const e of list) {
    const v = typeof e === "string" ? e : (e as { value?: string })?.value;
    if (v && v.includes("@")) return v.toLowerCase().trim();
  }
  return "";
}

export function mapPlaces(data: Resp["data"]): Found[] {
  const places = (Array.isArray(data?.[0]) ? (data as Place[][]).flat() : ((data || []) as Place[])) as Place[];
  return places.map((p) => {
    const email = firstEmail(p);
    return {
      key: str(p.place_id || p.google_id || p.name),
      company: str(p.name),
      contactName: "",
      title: "",
      email,
      phone: str(p.phone),
      website: str(p.site),
      industry: str(p.category || p.type),
      city: str(p.city),
      country: str(p.country),
      linkedin: "",
      hasEmail: !!email,
      needsReveal: false,
      extra: [p.rating ? `★ ${p.rating}` : "", p.reviews ? `(${p.reviews})` : "", str(p.full_address)].filter(Boolean).join(" "),
    };
  });
}

export async function outscraperSearch(key: string, f: OutscraperFilters, deadlineMs = Date.now() + 40_000): Promise<SearchResult> {
  const body = {
    query: [f.query.trim()],
    language: f.language || "ar",
    region: f.region || undefined,
    organizationsPerQueryLimit: Math.min(100, Math.max(1, f.limit || 20)),
    skipPlaces: Math.max(0, f.skip || 0),
    dropDuplicates: true,
    async: false,
    enrichment: f.findEmails ? ["domains_service"] : "",
  };
  const r = await providerFetch<Resp>("outscraper", `${BASE}/google-maps-search`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: Math.max(5_000, deadlineMs - Date.now()),
  });
  if (r.status === "Pending" && r.id) return outscraperPoll(key, r.id, deadlineMs);
  return { items: mapPlaces(r.data) };
}

/** Long searches run asynchronously at Outscraper: poll until done or the deadline, then let the UI check again. */
export async function outscraperPoll(key: string, id: string, deadlineMs = Date.now() + 40_000): Promise<SearchResult> {
  while (Date.now() < deadlineMs - 4_000) {
    const r = await providerFetch<Resp>("outscraper", `${BASE}/requests/${encodeURIComponent(id)}`, { headers: { "X-API-KEY": key }, timeoutMs: 15_000 });
    if (r.status !== "Pending") return { items: mapPlaces(r.data) };
    await new Promise((res) => setTimeout(res, 3_000));
  }
  return { items: [], pendingId: id };
}
