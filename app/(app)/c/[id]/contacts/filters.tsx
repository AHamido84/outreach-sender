"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ar } from "@/content/ar";

const STATUSES = ["New", "Ready", "Sent", "Follow-up", "Replied", "Bounced", "Unsubscribed", "Completed", "Invalid", "Duplicate"];

function Sel({ name, label, options, value, onChange }: { name: string; label: string; options: [string, string][]; value: string; onChange: (k: string, v: string) => void }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(name, e.target.value)}
      className="h-8 rounded-lg border bg-background px-2 text-sm"
    >
      <option value="">{label}: {ar.common.all}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function ContactsFilters({ facets }: { facets: { tags: string[]; sources: string[] } }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    n.delete("page");
    router.push(`${path}?${n.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") || "") !== q) set("q", q); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const any = ["q", "status", "tag", "lang", "source", "monday"].some((k) => sp.get(k));
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute inset-y-0 start-2 my-auto size-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar.common.search} className="ps-8" />
      </div>
      <Sel name="status" label={ar.contacts.filters.status} value={sp.get("status") || ""} onChange={set} options={STATUSES.map((s) => [s, ar.status[s] || s])} />
      <Sel name="tag" label={ar.contacts.filters.tags} value={sp.get("tag") || ""} onChange={set} options={facets.tags.map((t) => [t, t])} />
      <Sel name="lang" label={ar.contacts.filters.language} value={sp.get("lang") || ""} onChange={set} options={[["AR", "عربي"], ["EN", "English"]]} />
      <Sel name="source" label={ar.contacts.filters.source} value={sp.get("source") || ""} onChange={set} options={facets.sources.map((t) => [t, t])} />
      <Sel name="monday" label={ar.contacts.filters.monday} value={sp.get("monday") || ""} onChange={set} options={[["Synced", ar.contacts.mondayStatus.Synced], ["Failed", ar.contacts.mondayStatus.Failed], ["none", "—"]]} />
      {any && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.push(path); }}>
          <X />{ar.common.reset}
        </Button>
      )}
    </div>
  );
}
