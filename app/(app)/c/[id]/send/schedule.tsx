"use client";
import { CalendarPlus, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addSchedule, cancelSchedule } from "@/app/actions/send";
import { Section } from "@/components/app/bits";
import { Confirm } from "@/components/app/confirm";
import { errorMessage } from "@/components/app/error-box";
import { ScheduleBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/content/ar";
import { fmtDate } from "@/lib/format";

type Row = { runId: string; runAt: string; count: string; filter: string; status: string; result: string };

function defaultTime() {
  const d = new Date(Date.now() + 86400_000);
  d.setHours(10, 0, 0, 0);
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T10:00`;
}

export function ScheduleTab({ id, rows, tz, tags }: { id: string; rows: Row[]; tz: string; tags: string[] }) {
  const router = useRouter();
  const [runAt, setRunAt] = useState(defaultTime);
  const [count, setCount] = useState(10);
  const [tag, setTag] = useState("");
  const [lang, setLang] = useState("");
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const r = await addSchedule(id, { runAt, count, filter: { tags: tag ? tag.split(",").map((t) => t.trim()).filter(Boolean) : undefined, language: lang || undefined } });
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.send.schedAdded);
      router.refresh();
    });

  const cancel = (runId: string) =>
    start(async () => {
      const r = await cancelSchedule(id, runId);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.send.schedCancelled);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <Section title={ar.send.schedAdd}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="ra">{ar.send.runAt}</Label>
            <Input id="ra" type="datetime-local" dir="ltr" value={runAt} onChange={(e) => setRunAt(e.target.value)} className="w-56" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sc">{ar.send.count}</Label>
            <Input id="sc" type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-24" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="st">{ar.send.tags}</Label>
            <Input id="st" list="stags" value={tag} onChange={(e) => setTag(e.target.value)} className="w-48" />
            <datalist id="stags">{tags.map((t) => <option key={t} value={t} />)}</datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sl">{ar.send.language}</Label>
            <select id="sl" className="h-8 rounded-lg border bg-background px-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="">{ar.common.all}</option><option value="AR">عربي</option><option value="EN">English</option>
            </select>
          </div>
          <Button onClick={add} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <CalendarPlus />}{ar.common.add}</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{ar.send.tz(tz)} · {ar.send.schedHint}</p>
      </Section>

      <Section title={ar.send.upcoming}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-start"><th>{ar.send.runAt}</th><th>{ar.send.count}</th><th>{ar.send.filter}</th><th>{ar.fields.Status}</th><th>{ar.send.result}</th><th /></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.runId} className="[&>td]:px-2 [&>td]:py-2">
                    <td className="whitespace-nowrap">{fmtDate(r.runAt, tz)}<div className="font-mono text-[10px] text-muted-foreground">{r.runId}</div></td>
                    <td>{r.count}</td>
                    <td className="ltr text-xs text-muted-foreground">{r.filter || "—"}</td>
                    <td><ScheduleBadge status={r.status} /></td>
                    <td className="ltr text-xs">{r.result || "—"}</td>
                    <td>
                      {r.status === "Pending" && (
                        <Confirm trigger={<Button size="xs" variant="ghost"><X />{ar.send.cancelRun}</Button>} description={`${r.runId} — ${fmtDate(r.runAt, tz)}`} onConfirm={() => cancel(r.runId)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{ar.dashboard.noRuns}</p>
        )}
      </Section>
    </div>
  );
}
