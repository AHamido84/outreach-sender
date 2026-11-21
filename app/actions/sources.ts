"use server";
import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { loadWithSources, logActivity } from "@/lib/company";
import type { DedupOptions } from "@/lib/emails";
import { AppError } from "@/lib/errors";
import { appendContactRows, checkRows, countChecks, foundToRow } from "@/lib/import-core";
import { getStore } from "@/lib/sheets";
import { parseSheetId } from "@/lib/sheets/types";
import { apiKey, sourceSettings, sourcesApi } from "@/lib/sources";
import type { ApolloFilters, Found, HunterFilters, OutscraperFilters, Provider, SearchResult } from "@/lib/sources/types";
import { setKv } from "@/lib/table";

const LABEL: Record<Provider, string> = { apollo: "Apollo", hunter: "Hunter", outscraper: "Google Maps" };

export async function testSource(id: string, provider: Provider) {
  return act(async () => {
    await requireSession();
    const ctx = await loadWithSources(id);
    const info = await sourcesApi.test(provider, apiKey(ctx.sources, provider));
    await logActivity(ctx, "Test source", `${LABEL[provider]}: ${info}`);
    return { info };
  });
}

export async function disconnectSource(id: string, provider: Provider) {
  return act(async () => {
    await requireSession();
    const ctx = await loadWithSources(id);
    const key = { apollo: "Apollo API Key", hunter: "Hunter API Key", outscraper: "Outscraper API Key" }[provider];
    setKv(ctx.w, ctx.sources, key, "");
    await ctx.w.flush();
    await logActivity(ctx, "Source disconnected", LABEL[provider]);
    revalidatePath(`/c/${id}`, "layout");
    return true;
  });
}

type SearchInput =
  | { provider: "apollo"; filters: ApolloFilters }
  | { provider: "hunter"; filters: HunterFilters }
  | { provider: "outscraper"; filters: OutscraperFilters; pendingId?: string };

/** Search a source and annotate each result with valid / duplicate / DNC (when its email is known). */
export async function searchSource(id: string, input: SearchInput & { dedup?: DedupOptions }) {
  return act(async () => {
    await requireSession();
    const ctx = await loadWithSources(id);
    const s = sourceSettings(ctx.sources);
    const key = apiKey(ctx.sources, input.provider);
    if (input.provider === "outscraper" && !input.pendingId && !input.filters.query?.trim()) throw new AppError("invalid_input", "query");
    if (input.provider === "hunter" && !input.filters.domain?.trim() && !input.filters.company?.trim()) throw new AppError("invalid_input", "domain");
    let r: SearchResult;
    if (input.provider === "apollo") r = await sourcesApi.apolloSearch(key, input.filters);
    else if (input.provider === "hunter")
      r = await sourcesApi.hunterSearch(key, { type: s.hunterType, minConfidence: s.hunterMinConfidence, ...input.filters });
    else if (input.pendingId) r = await sourcesApi.outscraperPoll(key, input.pendingId);
    else
      r = await sourcesApi.outscraperSearch(key, {
        language: s.outLanguage, region: s.outRegion, findEmails: s.outFindEmails, ...input.filters,
      });
    const checks = checkRows(ctx, r.items.map((f) => foundToRow(f, LABEL[input.provider])), input.dedup);
    // Results that still need an email reveal (Apollo) can't be checked yet.
    const status = r.items.map((f, i) => (f.needsReveal ? (f.hasEmail ? "reveal" : "no_email") : f.email ? checks[i].status : "no_email"));
    return { ...r, status, reasons: checks.map((c) => c.reason || "") };
  });
}

export async function addFromSource(
  id: string,
  input: { provider: Provider; items: Found[]; tags: string; initialStatus: "Ready" | "New" } & DedupOptions,
) {
  return act(async () => {
    await requireSession();
    if (!input.items.length) throw new AppError("invalid_input");
    if (input.items.length > 200) throw new AppError("invalid_input", "max 200 per add");
    const ctx = await loadWithSources(id);
    const s = sourceSettings(ctx.sources);
    let items = input.items;
    let credits: number | undefined;
    let notFound = 0;
    if (input.provider === "apollo") {
      const toReveal = items.filter((f) => f.needsReveal).map((f) => f.key);
      if (toReveal.length) {
        const rev = await sourcesApi.apolloReveal(apiKey(ctx.sources, "apollo"), toReveal, s.apolloPersonal);
        credits = rev.credits;
        notFound = rev.missing;
        const byKey = new Map(rev.items.map((f) => [f.key, f]));
        items = items.map((f) => (f.needsReveal ? byKey.get(f.key) : f)).filter(Boolean) as Found[];
      }
    }
    const noEmail = items.filter((f) => !f.email).length;
    const rows = items.filter((f) => f.email).map((f) => foundToRow(f, LABEL[input.provider]));
    const r = rows.length
      ? await appendContactRows(ctx, rows, {
          source: LABEL[input.provider],
          initialStatus: input.initialStatus,
          tags: input.tags,
          allowSameDomain: input.allowSameDomain,
          allowResend: input.allowResend,
          activityLabel: `Source: ${LABEL[input.provider]}`,
        })
      : { added: 0, counts: countChecks([]), mondayCreated: 0 };
    revalidatePath(`/c/${id}`, "layout");
    return { added: r.added, counts: r.counts, credits, noEmail: noEmail + notFound };
  });
}

/** Read another Google Sheet (shared with the service account) for the import wizard. */
export async function readExternalSheet(id: string, url: string, tab?: string) {
  return act(async () => {
    await requireSession();
    const sid = parseSheetId(url);
    if (!sid) throw new AppError("invalid_url");
    const store = getStore();
    const meta = await store.getMeta(sid);
    const tabs = meta.tabs.map((t) => t.title);
    const name = tab && tabs.includes(tab) ? tab : tabs[0];
    const [values] = await store.batchGet(sid, [name]); // whole tab (the store quotes the name)
    const rows = values.filter((r) => r.some((c) => String(c).trim()));
    if (rows.length > 5001) throw new AppError("invalid_input", "max 5000 rows");
    await logActivity({ sheetId: id }, "Read external sheet", `${meta.title} / ${name}: ${Math.max(0, rows.length - 1)} rows`);
    return { title: meta.title, tab: name, tabs, matrix: rows, serviceAccount: store.serviceAccountEmail() };
  });
}
