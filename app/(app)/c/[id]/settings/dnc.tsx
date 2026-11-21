"use client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addDnc, removeDnc } from "@/app/actions/settings";
import { Section } from "@/components/app/bits";
import { Confirm } from "@/components/app/confirm";
import { errorMessage } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ar } from "@/content/ar";
import { fmtDate } from "@/lib/format";

export function DncTab({ id, rows }: { id: string; rows: { value: string; reason: string; at: string }[] }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      const r = await addDnc(id, value, reason);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      setValue(""); setReason("");
      router.refresh();
    });
  const remove = (v: string) =>
    start(async () => {
      const r = await removeDnc(id, v);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      router.refresh();
    });
  const shown = rows.filter((r) => !q || r.value.includes(q.toLowerCase()) || r.reason.includes(q));
  return (
    <Section>
      <div className="flex flex-wrap items-end gap-2">
        <Input dir="ltr" className="w-64" value={value} onChange={(e) => setValue(e.target.value)} placeholder="name@company.com / company.com" />
        <Input className="w-48" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ar.settings.reason} />
        <Button onClick={add} disabled={pending || !value.trim()}>{pending ? <Loader2 className="animate-spin" /> : <Plus />}{ar.settings.dncAdd}</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{ar.settings.dncHint}</p>
      <Input className="mt-4 w-64" value={q} onChange={(e) => setQ(e.target.value)} placeholder={ar.common.search} />
      <ul className="mt-2 divide-y text-sm">
        {shown.map((r) => (
          <li key={r.value} className="flex items-center gap-3 py-2">
            <span className="ltr flex-1 font-mono text-xs">{r.value}</span>
            <span className="text-xs text-muted-foreground">{r.reason}</span>
            <span className="w-24 text-xs text-muted-foreground">{fmtDate(r.at, undefined, false)}</span>
            <Confirm trigger={<Button size="icon-sm" variant="ghost" aria-label={ar.common.delete}><Trash2 /></Button>} description={r.value} destructive confirmLabel={ar.common.delete} onConfirm={() => remove(r.value)} />
          </li>
        ))}
        {!shown.length && <li className="py-6 text-center text-muted-foreground">{ar.common.empty}</li>}
      </ul>
    </Section>
  );
}
