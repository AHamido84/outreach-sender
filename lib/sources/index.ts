// Provider dispatcher (real APIs, or fakes in demo mode) + settings from the Sources tab.
import type { Kv } from "../table";
import { secret, num } from "../company";
import { isDemo } from "../env";
import { AppError } from "../errors";
import { isYes } from "../selection";
import { apolloReveal, apolloSearch, apolloTest } from "./apollo";
import { fakeApolloReveal, fakeApolloSearch, fakeHunterSearch, fakeOutscraperSearch } from "./fake";
import { hunterSearch, hunterTest } from "./hunter";
import { outscraperPoll, outscraperSearch } from "./outscraper";
import type { ApolloFilters, HunterFilters, OutscraperFilters, Provider } from "./types";

export const KEY_OF: Record<Provider, string> = { apollo: "Apollo API Key", hunter: "Hunter API Key", outscraper: "Outscraper API Key" };

export function sourceSettings(kv: Kv) {
  const v = kv.values;
  return {
    apolloPersonal: isYes(v["Apollo Reveal Personal Emails"]),
    hunterType: (["personal", "generic", "all"].includes(v["Hunter Email Type"]) ? v["Hunter Email Type"] : "personal") as "personal" | "generic" | "all",
    hunterMinConfidence: Math.min(100, Math.max(0, num(v["Hunter Min Confidence"], 70))),
    outLanguage: (v["Outscraper Language"] || "ar").trim(),
    outRegion: (v["Outscraper Region"] || "").trim(),
    outFindEmails: v["Outscraper Find Emails"] ? isYes(v["Outscraper Find Emails"]) : true,
    defaultTags: (v["Default Tags"] || "").trim(),
    defaultStatus: (v["Default Status"] || "Ready").trim() === "New" ? ("New" as const) : ("Ready" as const),
  };
}

export function apiKey(kv: Kv, p: Provider): string {
  const k = secret(kv, KEY_OF[p]);
  if (!k) throw new AppError("source_not_connected", p);
  return k;
}

export const sourcesApi = {
  apolloSearch: (key: string, f: ApolloFilters) => (isDemo() ? fakeApolloSearch(key, f) : apolloSearch(key, f)),
  apolloReveal: (key: string, ids: string[], personal: boolean) => (isDemo() ? fakeApolloReveal(key, ids) : apolloReveal(key, ids, { personalEmails: personal })),
  hunterSearch: (key: string, f: HunterFilters) => (isDemo() ? fakeHunterSearch(key, f) : hunterSearch(key, f)),
  outscraperSearch: (key: string, f: OutscraperFilters) => (isDemo() ? fakeOutscraperSearch(key, f) : outscraperSearch(key, f)),
  outscraperPoll: (key: string, id: string) => (isDemo() ? Promise.resolve({ items: [] }) : outscraperPoll(key, id)),
  async test(p: Provider, key: string): Promise<string> {
    if (isDemo()) {
      if (/bad|wrong/i.test(key)) throw new AppError("source_auth", "Invalid API key (demo)");
      return "OK (demo)";
    }
    if (p === "apollo") return apolloTest(key);
    if (p === "hunter") return hunterTest(key);
    // Outscraper has no free account endpoint in its SDK: verify with a 1-place search.
    const r = await outscraperSearch(key, { query: "cafe, Riyadh", limit: 1 });
    return `OK — ${r.items.length}`;
  },
};
