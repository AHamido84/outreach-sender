// Apollo.io: free people search (no emails) + bulk_match to reveal emails (credits) for picked people.
// Docs: https://docs.apollo.io/reference/people-api-search , https://docs.apollo.io/reference/bulk-people-enrichment
import { providerFetch, splitList, str } from "./http";
import type { ApolloFilters, Found, RevealResult, SearchResult } from "./types";

const BASE = "https://api.apollo.io/api/v1";

function headers(key: string) {
  return { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json", "Cache-Control": "no-cache" };
}

export function apolloSearchUrl(f: ApolloFilters): string {
  const q = new URLSearchParams();
  const arr = (name: string, values: string[]) => values.forEach((v) => q.append(`${name}[]`, v));
  arr("person_titles", splitList(f.titles));
  arr("person_locations", splitList(f.locations));
  arr("organization_locations", splitList(f.orgLocations));
  arr("q_organization_domains_list", splitList(f.domains).map((d) => d.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "")));
  arr("person_seniorities", f.seniorities || []);
  arr("organization_num_employees_ranges", f.employees || []);
  if (f.emailStatus === "verified") q.append("contact_email_status[]", "verified");
  if (f.keywords?.trim()) q.set("q_keywords", f.keywords.trim());
  q.set("page", String(Math.max(1, f.page || 1)));
  q.set("per_page", String(Math.min(100, Math.max(1, f.perPage || 25))));
  return `${BASE}/mixed_people/api_search?${q.toString()}`;
}

type ApolloPerson = {
  id: string; first_name?: string; last_name?: string; last_name_obfuscated?: string; name?: string; title?: string | null;
  has_email?: boolean; email?: string | null; email_status?: string | null; linkedin_url?: string | null;
  city?: string | null; state?: string | null; country?: string | null;
  organization?: { name?: string; website_url?: string | null; primary_domain?: string | null; industry?: string | null; phone?: string | null } | null;
};

export async function apolloSearch(key: string, f: ApolloFilters): Promise<SearchResult> {
  const r = await providerFetch<{ total_entries?: number; people?: ApolloPerson[] }>("apollo", apolloSearchUrl(f), { method: "POST", headers: headers(key) });
  return {
    total: r.total_entries,
    page: f.page || 1,
    items: (r.people || []).map((p) => ({
      key: p.id,
      company: str(p.organization?.name),
      contactName: [str(p.first_name), str(p.last_name || p.last_name_obfuscated)].filter(Boolean).join(" "),
      title: str(p.title),
      email: "",
      phone: "",
      website: "",
      industry: "",
      city: "",
      country: "",
      linkedin: "",
      hasEmail: !!p.has_email,
      needsReveal: true,
    })),
  };
}

/** Apollo returns placeholder addresses for locked emails. */
function realEmail(e: string | null | undefined): string {
  const v = str(e).toLowerCase();
  return v && !v.startsWith("email_not_unlocked@") && v.includes("@") ? v : "";
}

export async function apolloReveal(key: string, ids: string[], opts: { personalEmails?: boolean } = {}): Promise<RevealResult> {
  const items: Found[] = [];
  let credits = 0;
  let missing = 0;
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const url = `${BASE}/people/bulk_match?reveal_personal_emails=${opts.personalEmails ? "true" : "false"}&reveal_phone_number=false`;
    const r = await providerFetch<{ matches?: (ApolloPerson | null)[]; credits_consumed?: number }>("apollo", url, {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({ details: chunk.map((id) => ({ id })) }),
    });
    credits += Number(r.credits_consumed) || 0;
    for (const m of r.matches || []) {
      if (!m) {
        missing++;
        continue;
      }
      const org = m.organization || {};
      items.push({
        key: m.id,
        company: str(org.name),
        contactName: str(m.name) || [str(m.first_name), str(m.last_name)].filter(Boolean).join(" "),
        title: str(m.title),
        email: realEmail(m.email),
        phone: str(org.phone),
        website: str(org.website_url) || (org.primary_domain ? `https://${org.primary_domain}` : ""),
        industry: str(org.industry),
        city: str(m.city),
        country: str(m.country),
        linkedin: str(m.linkedin_url),
        hasEmail: !!realEmail(m.email),
        needsReveal: false,
        extra: m.email_status ? `email: ${m.email_status}` : undefined,
      });
    }
  }
  return { items, credits, missing };
}

/** Connection test: a 1-result search (search costs 0 credits). */
export async function apolloTest(key: string): Promise<string> {
  const r = await apolloSearch(key, { titles: "CEO", perPage: 1 });
  return `OK — ${r.total ?? 0}`;
}
