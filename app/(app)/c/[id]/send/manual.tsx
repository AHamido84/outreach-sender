"use client";
import { AlertTriangle, CheckCircle2, Eye, Loader2, Play, RefreshCw, Square, XCircle, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkAction } from "@/app/actions/contacts";
import { finishManualRun, previewRun, sendOne } from "@/app/actions/send";
import { Progress2, Section } from "@/components/app/bits";
import { Confirm } from "@/components/app/confirm";
import { ErrorBox, errorMessage } from "@/components/app/error-box";
import { ResultBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar, errorText } from "@/content/ar";
import type { SendResult } from "@/lib/engine";
import type { ErrorInfo } from "@/lib/errors";
import { itemUrl } from "@/lib/monday-values";
import type { Filter } from "@/lib/selection";
import { cn } from "@/lib/utils";

type Mode = "count" | "filter" | "select";
type PreviewData = { runId: string; results: SendResult[]; sentToday: number; dailyLimit: number; inWindow: boolean; delaySec: number; stopped?: string; planned: number };
type Line = SendResult & { state: "queued" | "sending" | "done" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ManualSend({ id, tags, mondaySlug, mondayBoard }: { id: string; tags: string[]; tz: string; mondaySlug: string; mondayBoard: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("count");
  const [count, setCount] = useState(5);
  const [tagSel, setTagSel] = useState("");
  const [lang, setLang] = useState("");
  const [ids, setIds] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [override, setOverride] = useState(false);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [running, setRunning] = useState(false);
  const [wait, setWait] = useState(0);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [pending, start] = useTransition();
  const stopRef = useRef(false);

  const filter = (): Filter | undefined => {
    if (mode === "filter") return { tags: tagSel ? tagSel.split(",").map((t) => t.trim()).filter(Boolean) : undefined, language: lang || undefined };
    if (mode === "select") return { ids: ids.split(/[\s,،]+/).map((x) => x.trim()).filter(Boolean) };
    return undefined;
  };

  const doPreview = () =>
    start(async () => {
      setError(null); setLines(null); setStopReason(null);
      const max = mode === "select" ? Math.max(1, (filter()?.ids || []).length) : count;
      const r = await previewRun(id, { max, filter: filter() });
      if (!r.ok) return setError(r.error);
      setPreview(r.data as PreviewData);
      setOverride(false);
    });

  const picks = preview?.results.filter((r) => r.result === "Preview") || [];
  const skipped = preview?.results.filter((r) => r.result === "Skipped") || [];
  const sendable = picks.length;

  const run = async () => {
    if (!preview) return;
    stopRef.current = false;
    setRunning(true);
    setStopReason(null);
    const ls: Line[] = picks.map((p) => ({ ...p, state: "queued" }));
    setLines(ls);
    let sent = 0, failed = 0;
    for (let i = 0; i < ls.length; i++) {
      if (stopRef.current) { setStopReason("stopped"); break; }
      setLines((cur) => cur!.map((l, j) => (j === i ? { ...l, state: "sending" } : l)));
      const r = await sendOne(id, { runId: preview.runId, contactId: ls[i].contactId, overrideWindow: override });
      if (!r.ok) {
        setLines((cur) => cur!.map((l, j) => (j === i ? { ...l, state: "done", result: "Failed", error: r.error } : l)));
        failed++;
        if (r.error.code === "unauthorized") break;
        continue;
      }
      const res = r.data.result;
      if (!res) {
        setLines((cur) => cur!.map((l, j) => (j === i ? { ...l, state: "done", result: "Skipped", error: { code: r.data.stopped || "nothing_to_send", detail: r.data.stopped || "" } } : l)));
        if (r.data.stopped && ["daily_limit", "outside_window", "locked", "sender_not_configured"].includes(r.data.stopped)) { setStopReason(r.data.stopped); break; }
        continue;
      }
      setLines((cur) => cur!.map((l, j) => (j === i ? { ...l, ...res, state: "done" } : l)));
      if (res.result === "Sent") sent++;
      if (res.result === "Failed") failed++;
      if (r.data.stopped === "smtp_auth") { setStopReason("smtp_auth"); break; }
      if (i < ls.length - 1 && res.result === "Sent" && preview.delaySec > 0) {
        for (let s = preview.delaySec; s > 0 && !stopRef.current; s--) { setWait(s); await sleep(1000); }
        setWait(0);
      }
    }
    setRunning(false);
    await finishManualRun(id, { runId: preview.runId, sent, failed, total: ls.length });
    toast.success(`${ar.send.finished}: ${ar.result.Sent} ${sent} · ${ar.result.Failed} ${failed}`);
    router.refresh();
  };

  const retryMonday = async (contactId: string) => {
    const r = await bulkAction(id, [contactId], "monday");
    if (!r.ok) return void toast.error(errorMessage(r.error));
    setLines((cur) => cur!.map((l) => (l.contactId === contactId ? { ...l, monday: { ...l.monday, ok: r.data.count > 0, error: r.data.count ? undefined : r.data.errors[0] || "retry failed" } } : l)));
  };

  const done = lines?.filter((l) => l.state === "done").length || 0;

  return (
    <div className="space-y-4">
      <Section>
        <div className="flex flex-wrap gap-1 rounded-lg border p-0.5 sm:w-fit">
          {(["count", "filter", "select"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn("rounded-md px-3 py-1.5 text-sm", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {ar.send.mode[m]}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {mode !== "select" && (
            <div className="space-y-1">
              <Label htmlFor="cnt">{ar.send.count}</Label>
              <Input id="cnt" type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-28" />
            </div>
          )}
          {mode === "filter" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="tg">{ar.send.tags}</Label>
                <Input id="tg" list="tag-list" value={tagSel} onChange={(e) => setTagSel(e.target.value)} className="w-56" />
                <datalist id="tag-list">{tags.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
              <div className="space-y-1">
                <Label htmlFor="lg">{ar.send.language}</Label>
                <select id="lg" className="h-8 rounded-lg border bg-background px-2 text-sm" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="">{ar.common.all}</option><option value="AR">عربي</option><option value="EN">English</option>
                </select>
              </div>
            </>
          )}
          {mode === "select" && (
            <div className="w-full space-y-1 sm:w-96">
              <Label htmlFor="ids">{ar.send.ids}</Label>
              <Input id="ids" dir="ltr" value={ids} onChange={(e) => setIds(e.target.value)} placeholder="C0047, C0048" />
            </div>
          )}
          <Button variant="outline" onClick={doPreview} disabled={pending || running}>
            {pending ? <Loader2 className="animate-spin" /> : <Eye />}{ar.send.preview}
          </Button>
        </div>
      </Section>

      {error && <ErrorBox error={error} />}

      {preview && !lines && (
        <Section title={ar.send.previewTitle} actions={<span className="text-xs text-muted-foreground">{ar.send.limitInfo(preview.sentToday, preview.dailyLimit)}</span>}>
          {preview.stopped && preview.stopped !== "nothing_to_send" && !sendable && <ErrorBox error={{ code: preview.stopped, detail: preview.stopped }} className="mb-3" />}
          {!preview.inWindow && sendable > 0 && (
            <div className="mb-3 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{ar.send.outsideWindow}</p>
              <label className="flex items-center gap-2 font-medium"><Checkbox checked={override} onCheckedChange={(v) => setOverride(!!v)} />{ar.send.overrideWindow}</label>
            </div>
          )}
          {sendable ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-start"><th>{ar.send.contact}</th><th>{ar.send.template}</th><th>{ar.send.step}</th><th>{ar.templates.subject}</th></tr>
                </thead>
                <tbody className="divide-y">
                  {picks.map((p) => (
                    <tr key={p.contactId} className="[&>td]:px-2 [&>td]:py-1.5">
                      <td><div className="font-medium">{p.company || p.name}</div><div className="font-mono text-xs text-muted-foreground">{p.contactId} · {p.email}</div></td>
                      <td className="text-xs">{p.templateName} <span className="text-muted-foreground">({p.templateId})</span></td>
                      <td className="text-xs">{p.step === 0 ? ar.templates.step0 : ar.templates.followup(p.step)}</td>
                      <td className="max-w-72 text-xs">
                        <span className="line-clamp-1">{p.subject}</span>
                        {!!p.missing?.length && <span className="mt-0.5 flex items-center gap-1 text-amber-700"><AlertTriangle className="size-3" />{ar.skip.missing_vars}: <span className="ltr font-mono">{p.missing.join(", ")}</span></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{ar.send.previewEmpty}</p>
          )}
          {!!skipped.length && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {skipped.map((s) => <li key={s.contactId}>• {s.contactId} {s.email}: {errorText(s.error?.code || "")}</li>)}
            </ul>
          )}
          {sendable > 0 && (
            <div className="mt-4">
              <Confirm
                trigger={<Button size="lg" disabled={!preview.inWindow && !override}><Play />{ar.send.sendBtn(sendable)}</Button>}
                title={ar.send.confirmTitle}
                description={ar.send.confirmText(sendable)}
                confirmLabel={ar.send.sendBtn(sendable)}
                onConfirm={run}
              />
            </div>
          )}
        </Section>
      )}

      {lines && (
        <Section
          title={`${ar.send.progress} — ${done}/${lines.length}`}
          actions={running ? (
            <Button variant="outline" size="sm" onClick={() => (stopRef.current = true)}><Square />{ar.send.stopBtn}</Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => { setLines(null); setPreview(null); }}><RefreshCw />{ar.common.reset}</Button>
          )}
        >
          <Progress2 value={done} max={lines.length} />
          <p className="mt-2 h-5 text-xs text-muted-foreground">
            {running && wait > 0 && ar.send.waiting(wait)}
            {stopReason && <span className="text-amber-700">{stopReason === "stopped" ? ar.send.stopped : errorText(stopReason)}</span>}
          </p>
          <ul className="mt-2 divide-y text-sm">
            {lines.map((l) => (
              <li key={l.contactId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-5">
                  {l.state === "queued" && <span className="block size-2 rounded-full bg-muted-foreground/30" />}
                  {l.state === "sending" && <Loader2 className="size-4 animate-spin text-primary" />}
                  {l.state === "done" && (l.result === "Sent" ? <CheckCircle2 className="size-4 text-emerald-600" /> : <XCircle className="size-4 text-rose-600" />)}
                </span>
                <span className="min-w-40 flex-1">
                  <span className="font-medium">{l.company || l.name}</span>
                  <span className="ltr ms-3 inline-block font-mono text-xs text-muted-foreground">{l.email}</span>
                  {l.error && l.result !== "Sent" && <span className="block text-xs text-rose-600">{errorText(l.error.code)} <span className="ltr text-muted-foreground">{l.error.detail !== l.error.code ? l.error.detail : ""}</span></span>}
                </span>
                {l.state === "done" && <ResultBadge result={l.result} />}
                {l.state === "done" && l.result === "Sent" && l.monday && !l.monday.skipped && (
                  <span className="flex items-center gap-1 text-xs">
                    {l.monday.ok ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : <XCircle className="size-3.5 text-rose-600" />}
                    monday
                    {l.monday.itemId && mondayBoard && (
                      <a href={l.monday.url || itemUrl(mondaySlug, mondayBoard, l.monday.itemId)} target="_blank" rel="noreferrer" className="text-primary"><ExternalLink className="size-3.5" /></a>
                    )}
                    {!l.monday.ok && <Button size="xs" variant="outline" onClick={() => retryMonday(l.contactId)}><RefreshCw />{ar.common.retry}</Button>}
                  </span>
                )}
                {l.state === "done" && l.monday && !l.monday.ok && l.monday.error && (
                  <span className="ltr basis-full ps-8 text-xs text-rose-600">monday: {l.monday.error}</span>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
