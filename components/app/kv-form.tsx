"use client";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettings } from "@/app/actions/settings";
import { errorMessage } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ar } from "@/content/ar";
import { WEEKDAYS } from "@/lib/time";
import { cn } from "@/lib/utils";

export type FieldDef = {
  key: string;
  type?: "text" | "number" | "email" | "url" | "password" | "textarea" | "yesno" | "days" | "select";
  options?: [string, string][];
  hint?: string;
  ltr?: boolean;
  secret?: { set: boolean; last4: string };
  span?: 2;
};

export function KvForm({ id, tab, fields, values, title, onSaved, preset }: { id: string; tab: string; fields: FieldDef[]; values: Record<string, string>; title?: string; onSaved?: () => void; preset?: Record<string, string> | null }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => ({ ...values }));
  const [pending, start] = useTransition();
  useEffect(() => {
    if (preset) setV((cur) => ({ ...cur, ...Object.fromEntries(Object.entries(preset).filter(([k]) => fields.some((f) => f.key === k))) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);
  const dirty = fields.some((f) => (f.secret ? !!v[f.key] : (v[f.key] ?? "") !== (values[f.key] ?? "")));

  const save = () =>
    start(async () => {
      const payload: Record<string, string> = {};
      for (const f of fields) if (f.secret ? v[f.key] : (v[f.key] ?? "") !== (values[f.key] ?? "")) payload[f.key] = v[f.key] ?? "";
      const r = await saveSettings(id, tab, payload);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.settings.fieldsSaved);
      setV((cur) => Object.fromEntries(Object.entries(cur).map(([k, x]) => [k, fields.find((f) => f.key === k)?.secret ? "" : x])));
      onSaved?.();
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {title && <h3 className="text-sm font-semibold text-muted-foreground">{title}</h3>}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const label = ar.fields[f.key] || f.key;
          const val = v[f.key] ?? "";
          const set = (x: string) => setV({ ...v, [f.key]: x });
          return (
            <div key={f.key} className={cn("space-y-1", (f.span === 2 || f.type === "textarea" || f.type === "days") && "sm:col-span-2")}>
              <Label htmlFor={`kv-${f.key}`}>{label}</Label>
              {f.type === "textarea" ? (
                <Textarea id={`kv-${f.key}`} rows={4} value={val} onChange={(e) => set(e.target.value)} />
              ) : f.type === "yesno" ? (
                <select id={`kv-${f.key}`} className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={/^(yes|on|true|1)$/i.test(val) ? "yes" : "no"} onChange={(e) => set(e.target.value)}>
                  <option value="yes">{ar.common.yes}</option><option value="no">{ar.common.no}</option>
                </select>
              ) : f.type === "select" ? (
                <select id={`kv-${f.key}`} className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={val} onChange={(e) => set(e.target.value)}>
                  {f.options!.map(([o, l]) => <option key={o} value={o}>{l}</option>)}
                </select>
              ) : f.type === "days" ? (
                <div className="flex flex-wrap gap-1.5">
                  {(["Sat", ...WEEKDAYS.filter((d) => d !== "Sat")] as string[]).map((d) => {
                    const on = val.split(/[,\s]+/).map((x) => x.slice(0, 3).toLowerCase()).includes(d.toLowerCase());
                    return (
                      <button key={d} type="button" onClick={() => {
                        const cur = val.split(/[,\s]+/).filter(Boolean).map((x) => x.slice(0, 3));
                        const next = on ? cur.filter((x) => x.toLowerCase() !== d.toLowerCase()) : [...cur, d];
                        set(WEEKDAYS.filter((w) => next.map((n) => n.toLowerCase()).includes(w.toLowerCase())).join(","));
                      }} className={cn("rounded-lg border px-3 py-1 text-sm", on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
                        {ar.days[d]}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Input
                  id={`kv-${f.key}`}
                  type={f.type === "password" ? "password" : f.type === "number" ? "number" : "text"}
                  dir={f.ltr || ["email", "url", "password"].includes(f.type || "") ? "ltr" : undefined}
                  autoComplete={f.type === "password" ? "new-password" : "off"}
                  value={val}
                  placeholder={f.secret ? (f.secret.set ? ar.common.secretPlaceholder : ar.common.secretNotSet) : undefined}
                  onChange={(e) => set(e.target.value)}
                />
              )}
              {f.secret?.set && <p className="text-xs text-emerald-700">{ar.common.secretSaved} ••••{f.secret.last4}</p>}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={pending || !dirty}>{pending ? <Loader2 className="animate-spin" /> : <Save />}{ar.common.save}</Button>
    </div>
  );
}
