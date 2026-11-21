"use client";
import { X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ar } from "@/content/ar";

export function LogFilters() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    router.push(`${path}?${n.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get("q") || "") !== q) set("q", q); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input className="w-56" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar.common.search} />
      <select aria-label={ar.send.result} className="h-8 rounded-lg border bg-background px-2 text-sm" value={sp.get("result") || ""} onChange={(e) => set("result", e.target.value)}>
        <option value="">{ar.send.result}: {ar.common.all}</option>
        {["Sent", "Failed", "Skipped"].map((r) => <option key={r} value={r}>{ar.result[r]}</option>)}
      </select>
      <select aria-label={ar.activity.type} className="h-8 rounded-lg border bg-background px-2 text-sm" value={sp.get("type") || ""} onChange={(e) => set("type", e.target.value)}>
        <option value="">{ar.activity.type}: {ar.common.all}</option>
        {["manual", "scheduled", "auto"].map((r) => <option key={r} value={r}>{ar.runType[r]}</option>)}
      </select>
      {sp.get("run") && (
        <Button size="sm" variant="secondary" onClick={() => set("run", "")}>
          {ar.activity.filterRun}: <span className="font-mono">{sp.get("run")}</span><X />
        </Button>
      )}
    </div>
  );
}
