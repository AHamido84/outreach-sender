"use client";
import { ArrowLeft, ExternalLink, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addFromSource, searchSource } from "@/app/actions/sources";
import { Section } from "@/components/app/bits";
import { Confirm } from "@/components/app/confirm";
import { ErrorBox } from "@/components/app/error-box";
import { Pill } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/content/ar";
import type { ErrorInfo } from "@/lib/errors";
import type { Found, Provider } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

type Defaults = { tags: string; status: "Ready" | "New"; allowSameDomain: boolean; allowResend: boolean; hunterType: string; hunterMin: number; outFindEmails: boolean };
type Results = { items: Found[]; status: string[]; reasons: string[]; total?: number; page?: number; pendingId?: string; info?: string; planLimited?: number };

const TONE: Record<string, string> = { valid: "Done", duplicate: "Duplicate", dnc: "Unsubscribed", invalid: "Invalid", reveal: "Pending", no_email: "Completed" };
const SENIORITIES = ["owner", "founder", "c_suite", "director", "manager", "head", "vp", "senior"];
const EMPLOYEES = ["1,10", "11,50", "51,200", "201,500", "501,1000", "1001,5000"];
const H_SENIORITY = ["junior", "senior", "executive"];

function Chips({ options, value, onChange, label }: { options: [string, string][]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {options.map(([k, l]) => {
          const on = value.includes(k);
          return (
            <button key={k} type="button" onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              {l}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id?: string; label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

export function SourceFinder({ id, connected, defaults }: { id: string; connected: Record<Provider, boolean>; defaults: Defaults }) {
  const router = useRouter();
  const first = (["apollo", "hunter", "outscraper"] as Provider[]).find((p) => connected[p]) || "apollo";
  const [provider, setProvider] = useState<Provider>(first);
  // Apollo
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [orgLocations, setOrgLocations] = useState("");
  const [keywords, setKeywords] = useState("");
  const [domains, setDomains] = useState("");
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);
  const [perPage, setPerPage] = useState(25);
  // Hunter
  const [domain, setDomain] = useState("");
  const [company, setCompany] = useState("");
  const [hType, setHType] = useState(defaults.hunterType);
  const [hMin, setHMin] = useState(defaults.hunterMin);
  const [hSeniority, setHSeniority] = useState<string[]>([]);
  // Outscraper
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [findEmails, setFindEmails] = useState(defaults.outFindEmails);
  // Results + add options
  const [results, setResults] = useState<Results | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [tags, setTags] = useState(defaults.tags);
  const [status, setStatus] = useState<"Ready" | "New">(defaults.status);
  const [allowSameDomain, setAllowSameDomain] = useState(defaults.allowSameDomain);
  const [allowResend, setAllowResend] = useState(defaults.allowResend);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [pending, start] = useTransition();
  const [adding, startAdd] = useTransition();

  const run = (page = 1, pendingId?: string) =>
    start(async () => {
      setError(null);
      const dedup = { allowSameDomain, allowResend };
      const r =
        provider === "apollo"
          ? await searchSource(id, { provider, dedup, filters: { titles, locations, orgLocations, keywords, domains, seniorities, employees, emailStatus: verified ? "verified" : "any", page, perPage } })
          : provider === "hunter"
            ? await searchSource(id, { provider, dedup, filters: { domain, company, type: hType as "personal", minConfidence: hMin, seniority: hSeniority, limit: 50 } })
            : await searchSource(id, { provider, dedup, pendingId, filters: { query, limit, findEmails } });
      if (!r.ok) return setError(r.error);
      setResults(r.data as Results);
      setSel(new Set());
    });

  const switchTo = (p: Provider) => { setProvider(p); setResults(null); setSel(new Set()); setError(null); };
  const selectable = (i: number) => results && !["dnc", "no_email", "invalid"].includes(results.status[i]);
  const selectNew = () => results && setSel(new Set(results.items.filter((_, i) => ["valid", "reveal"].includes(results.status[i])).map((f) => f.key)));
  const picked = results?.items.filter((f) => sel.has(f.key)) || [];
  const needsReveal = picked.filter((f) => f.needsReveal).length;

  const add = () =>
    startAdd(async () => {
      const r = await addFromSource(id, { provider, items: picked, tags, initialStatus: status, allowSameDomain, allowResend });
      if (!r.ok) return setError(r.error);
      const d = r.data;
      toast.success(
        [ar.sources.added(d.added), d.credits != null ? ar.sources.credits(d.credits) : "", d.noEmail ? ar.sources.noEmailSkipped(d.noEmail) : "",
          d.counts.duplicate ? `${ar.import.duplicate}: ${d.counts.duplicate}` : ""].filter(Boolean).join(" · "),
        { duration: 8000 },
      );
      setSel(new Set());
      router.refresh();
      run(results?.page || 1);
    });

  const anyConnected = Object.values(connected).some(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 rounded-lg border p-0.5 sm:w-fit">
        {(["apollo", "hunter", "outscraper"] as Provider[]).map((p) => (
          <button key={p} type="button" onClick={() => switchTo(p)}
            className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm", provider === p ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            <span className={cn("size-1.5 rounded-full", connected[p] ? "bg-emerald-500" : "bg-zinc-300")} />
            {ar.sources.providers[p].name}
          </button>
        ))}
        <Link href={`/c/${id}/contacts/import`} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">{ar.sources.providers.sheet.name}</Link>
      </div>

      {!connected[provider] ? (
        <Section>
          <p className="text-sm text-muted-foreground">{ar.sources.providers[provider].desc}</p>
          <Button className="mt-3" asChild><Link href={`/c/${id}/settings?tab=sources`}>{ar.sources.goSettings}<ArrowLeft /></Link></Button>
          {!anyConnected && <p className="mt-3 text-xs text-muted-foreground">{ar.sources.settingsHint}</p>}
        </Section>
      ) : (
        <Section>
          <p className="mb-4 text-sm text-muted-foreground">{ar.sources.providers[provider].desc}</p>
          <form onSubmit={(e) => { e.preventDefault(); run(1); }} className="space-y-4">
            {provider === "apollo" && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field id="a-t" label={ar.sources.f.titles}><Input id="a-t" value={titles} onChange={(e) => setTitles(e.target.value)} placeholder={ar.sources.f.titlesPh} /></Field>
                <Field id="a-l" label={ar.sources.f.locations}><Input id="a-l" value={locations} onChange={(e) => setLocations(e.target.value)} placeholder={ar.sources.f.locationsPh} /></Field>
                <Field id="a-o" label={ar.sources.f.orgLocations}><Input id="a-o" value={orgLocations} onChange={(e) => setOrgLocations(e.target.value)} placeholder={ar.sources.f.locationsPh} /></Field>
                <Field id="a-k" label={ar.sources.f.keywords}><Input id="a-k" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="real estate, dental" /></Field>
                <Field id="a-d" label={ar.sources.f.domains}><Input id="a-d" dir="ltr" value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="acme.com, example.sa" /></Field>
                <Field id="a-p" label={ar.sources.f.perPage}>
                  <select id="a-p" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={perPage} onChange={(e) => setPerPage(Number(e.target.value))}>
                    {[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
                <Chips label={ar.sources.f.seniorities} value={seniorities} onChange={setSeniorities} options={SENIORITIES.map((s) => [s, ar.sources.seniority[s]])} />
                <Chips label={ar.sources.f.employees} value={employees} onChange={setEmployees} options={EMPLOYEES.map((e) => [e, e.replace(",", "–")])} />
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={verified} onCheckedChange={(v) => setVerified(!!v)} />{ar.sources.f.verifiedOnly}</label>
              </div>
            )}
            {provider === "hunter" && (
              <div className="grid gap-3 md:grid-cols-2">
                <Field id="h-d" label={ar.sources.f.domain}><Input id="h-d" dir="ltr" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder={ar.sources.f.domainPh} /></Field>
                <Field id="h-c" label={ar.sources.f.company}><Input id="h-c" value={company} onChange={(e) => setCompany(e.target.value)} /></Field>
                <Field id="h-t" label={ar.sources.f.emailType}>
                  <select id="h-t" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={hType} onChange={(e) => setHType(e.target.value)}>
                    {Object.entries(ar.sources.emailTypes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </Field>
                <Field id="h-m" label={ar.sources.f.minConfidence}><Input id="h-m" type="number" min={0} max={100} value={hMin} onChange={(e) => setHMin(Number(e.target.value))} /></Field>
                <Chips label={ar.sources.f.seniorities} value={hSeniority} onChange={setHSeniority} options={H_SENIORITY.map((s) => [s, ar.sources.hunterSeniority[s]])} />
                <p className="text-xs text-muted-foreground md:col-span-2">{ar.sources.hunterTip}</p>
              </div>
            )}
            {provider === "outscraper" && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-2"><Field id="o-q" label={ar.sources.f.query}><Input id="o-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={ar.sources.f.queryPh} /></Field></div>
                <Field id="o-l" label={ar.sources.f.limit}>
                  <select id="o-l" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                    {[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2 text-sm md:col-span-3"><Checkbox checked={findEmails} onCheckedChange={(v) => setFindEmails(!!v)} />{ar.sources.f.findEmails}</label>
              </div>
            )}
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Search />}{pending ? ar.sources.searching : ar.sources.search}</Button>
          </form>
        </Section>
      )}

      {error && <ErrorBox error={error} />}

      {results?.pendingId && (
        <Section>
          <p className="text-sm">{ar.sources.pending}</p>
          <Button className="mt-2" variant="outline" disabled={pending} onClick={() => run(1, results.pendingId)}><RefreshCw />{ar.sources.checkAgain}</Button>
        </Section>
      )}

      {results && !results.pendingId && (
        <Section
          title={ar.sources.results(results.items.length, results.total)}
          actions={results.items.length > 0 && <Button size="sm" variant="outline" onClick={selectNew}>{ar.sources.selectAllNew}</Button>}
        >
          {results.info && <p className="mb-2 text-xs text-muted-foreground ltr">{results.info}</p>}
          {results.planLimited && <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">{ar.sources.planLimited(results.planLimited)}</p>}
          {!results.items.length ? (
            <p className="text-sm text-muted-foreground">{ar.sources.noResults}</p>
          ) : (
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-start">
                    <th className="w-8"><Checkbox checked={sel.size > 0 && results.items.every((f, i) => !selectable(i) || sel.has(f.key))}
                      onCheckedChange={(v) => setSel(v ? new Set(results.items.filter((_, i) => selectable(i)).map((f) => f.key)) : new Set())} aria-label="select all" /></th>
                    <th>{ar.sources.columns.who}</th><th>{ar.sources.columns.email}</th><th>{ar.sources.columns.place}</th><th>{ar.sources.columns.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {results.items.map((f, i) => {
                    const st = results.status[i];
                    return (
                      <tr key={f.key + i} className={cn("align-top [&>td]:px-2 [&>td]:py-2", sel.has(f.key) && "bg-primary/5")}>
                        <td><Checkbox disabled={!selectable(i)} checked={sel.has(f.key)} aria-label={f.key}
                          onCheckedChange={() => setSel((s) => { const n = new Set(s); if (n.has(f.key)) n.delete(f.key); else n.add(f.key); return n; })} /></td>
                        <td className="min-w-48">
                          <div className="font-medium">{f.contactName || f.company}</div>
                          <div className="text-xs text-muted-foreground">{[f.title, f.contactName ? f.company : f.industry].filter(Boolean).join(" · ")}</div>
                          {f.extra && <div className="text-xs text-muted-foreground">{f.extra}</div>}
                        </td>
                        <td className="font-mono text-xs">
                          {f.email || (f.needsReveal ? (f.hasEmail ? "•••@•••" : "—") : "—")}
                          {f.confidence != null && <span className="ms-1 font-sans text-muted-foreground">{f.confidence}%</span>}
                          {f.website && <a href={f.website} target="_blank" rel="noreferrer" className="block font-sans text-primary hover:underline">{f.website.replace(/^https?:\/\//, "")} <ExternalLink className="inline size-3" /></a>}
                        </td>
                        <td className="text-xs text-muted-foreground">{[f.city, f.country].filter(Boolean).join("، ") || "—"}</td>
                        <td>
                          <Pill tone={TONE[st] || "New"}>{ar.sources.status[st] || st}</Pill>
                          {results.reasons[i] && st === "duplicate" && <div className="mt-0.5 text-xs text-muted-foreground">{ar.import.reasons[results.reasons[i]]}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {provider === "apollo" && !!results.total && (results.page || 1) * perPage < results.total && (
            <Button className="mt-3" size="sm" variant="outline" disabled={pending} onClick={() => run((results.page || 1) + 1)}>{ar.sources.nextPage}</Button>
          )}

          {results.items.length > 0 && (
            <div className="mt-4 space-y-3 rounded-lg bg-muted/50 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field id="s-tags" label={ar.sources.addTags}><Input id="s-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="apollo, ceo-riyadh" /></Field>
                <Field id="s-st" label={ar.import.initialStatus}>
                  <select id="s-st" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "Ready")}>
                    <option value="Ready">{ar.status.Ready}</option><option value="New">{ar.status.New}</option>
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={allowSameDomain} onCheckedChange={(v) => setAllowSameDomain(!!v)} />{ar.import.allowSameDomain}</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={allowResend} onCheckedChange={(v) => setAllowResend(!!v)} />{ar.import.allowResend}</label>
              {needsReveal > 0 && <p className="text-xs text-amber-800">{ar.sources.revealNote}</p>}
              <Confirm
                trigger={<Button disabled={!sel.size || adding}>{adding ? <Loader2 className="animate-spin" /> : <Plus />}{ar.sources.addSelected(sel.size)}</Button>}
                description={needsReveal ? `${ar.sources.addSelected(sel.size)} — ${ar.sources.revealNote}` : ar.sources.addSelected(sel.size)}
                onConfirm={add}
              />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
