"use client";
import { CalendarClock, Loader2, Pause, Play, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { setAutoSending } from "@/app/actions/settings";
import { runNow } from "@/app/actions/send";
import { errorMessage } from "@/components/app/error-box";
import { Progress2 } from "@/components/app/bits";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ar, warningText } from "@/content/ar";
import { fmtDate, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AutoStatus } from "@/lib/views";

const STATE_TONE: Record<string, string> = {
  running: "bg-emerald-500", paused: "bg-zinc-400", outside_window: "bg-sky-500", daily_limit: "bg-indigo-500",
  bounce_guard: "bg-rose-500", sender_not_configured: "bg-rose-500", stopped: "bg-rose-500", blocked: "bg-amber-500",
};

export function AutoPanel({ id, status }: { id: string; status: AutoStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [running, startRun] = useTransition();

  const toggle = (on: boolean) =>
    start(async () => {
      const r = await setAutoSending(id, on);
      if (!r.ok) {
        const detail = r.error.code === "auto_blocked" ? r.error.detail.split(", ").map((b) => warningText(b)).join("، ") : errorMessage(r.error);
        toast.error(`${ar.auto.cannotStart} ${detail}`);
        return;
      }
      toast.success(on ? ar.auto.started : ar.auto.paused);
      router.refresh();
    });

  const now = () =>
    startRun(async () => {
      const r = await runNow(id);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      const sent = r.data.results.filter((x) => x.result === "Sent").length;
      const failed = r.data.results.filter((x) => x.result === "Failed").length;
      if (sent || failed) toast.success(`${ar.result.Sent}: ${sent} · ${ar.result.Failed}: ${failed}`);
      else toast.info(ar.stop[r.data.stopped || "nothing_to_send"] || ar.stop.nothing_to_send);
      router.refresh();
    });

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <Zap className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">{ar.auto.title}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          <span className={cn("size-2 rounded-full", STATE_TONE[status.state], status.state === "running" && "animate-pulse")} />
          {ar.auto.state[status.state]}
          {status.offReason && !status.on && <> — {ar.autoOffReason[status.offReason] || status.offReason}</>}
        </span>
        <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm font-medium">
          {status.on ? ar.auto.on : ar.auto.off}
          <Switch checked={status.on} disabled={pending} onCheckedChange={toggle} className="scale-125" aria-label={ar.auto.title} />
        </label>
      </div>

      {status.state === "blocked" && !!status.blockers.length && (
        <ul className="mt-3 space-y-1 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
          {status.blockers.map((b) => <li key={b}>• {warningText(b)}</li>)}
        </ul>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">{ar.auto.progress}</p>
          <p className="mt-1 font-semibold tabular-nums">{status.sentToday} / {status.dailyLimit}</p>
          <Progress2 value={status.sentToday} max={status.dailyLimit} className="mt-1.5" />
          {status.paceMinutes > 0 && <p className="mt-1 text-xs text-muted-foreground">{ar.auto.pace(String(Math.round(status.paceMinutes * 10) / 10))}</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{ar.auto.nextRun}</p>
          <p className="mt-1 flex items-center gap-1 font-semibold">
            <CalendarClock className="size-4 text-muted-foreground" />
            {status.nextRun ? fmtDate(status.nextRun, status.tz) : "—"}
          </p>
          {status.nextRun && <p className="text-xs text-muted-foreground">{fmtRelative(status.nextRun)}</p>}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{ar.auto.lastRun}</p>
          <p className="ltr mt-1 truncate text-end text-sm font-medium">{status.lastRun.result || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {fmtRelative(status.lastRun.at)}
            {status.lastRun.id && (
              <> · <Link className="text-primary hover:underline" href={`/c/${id}/activity?run=${encodeURIComponent(status.lastRun.id)}`}>{ar.auto.viewLog}</Link></>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{ar.auto.forecast}</p>
          <p className="mt-1 text-sm">{ar.auto.forecastText(status.readyCount, status.forecastDays)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={status.on ? "outline" : "default"} disabled={pending} onClick={() => toggle(!status.on)}>
          {pending ? <Loader2 className="animate-spin" /> : status.on ? <Pause /> : <Play />}
          {status.on ? ar.auto.pause : ar.auto.resume}
        </Button>
        <Button variant="outline" disabled={running} onClick={now} title={ar.auto.runNowHint}>
          {running ? <Loader2 className="animate-spin" /> : <Zap />}
          {ar.auto.runNow}
        </Button>
      </div>
    </section>
  );
}
