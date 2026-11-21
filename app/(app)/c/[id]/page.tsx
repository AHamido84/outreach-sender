import { AlertTriangle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { AutoPanel } from "@/components/app/auto-panel";
import { Kpi, Section } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { SchedulerHealthBadge } from "@/components/app/scheduler-health";
import { ScheduleBadge } from "@/components/app/status-badge";
import { ar, warningText } from "@/content/ar";
import { loadCompany, senderSettings, type Ctx } from "@/lib/company";
import { toErrorInfo } from "@/lib/errors";
import { fmtDate, fmtRelative, pct } from "@/lib/format";
import { TABS } from "@/lib/schema";
import { parseFilter } from "@/lib/selection";
import { get } from "@/lib/table";
import { autoStatus, kpis, schedulerHealth, sendsPerDay, warnings } from "@/lib/views";
import { CheckInboxButton } from "./check-inbox";

export default async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ctx: Ctx;
  try {
    ctx = await loadCompany(id, [TABS.sendLog, TABS.schedule, TABS.activity]);
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
  const health = await schedulerHealth();
  const log = ctx.t[TABS.sendLog].rows;
  const s = senderSettings(ctx);
  const k = kpis(ctx, log);
  const chart = sendsPerDay(log, s.tz);
  const maxDay = Math.max(1, ...chart.map((d) => d.sent + d.failed));
  const warns = warnings(ctx, health);
  const status = autoStatus(ctx, log);
  const upcoming = ctx.t[TABS.schedule].rows
    .filter((r) => ["Pending", "Running"].includes(get(r, "Status") || "Pending"))
    .sort((a, b) => get(a, "Run At").localeCompare(get(b, "Run At")))
    .slice(0, 5);
  const activity = [...ctx.t[TABS.activity].rows].sort((a, b) => get(b, "Time").localeCompare(get(a, "Time"))).slice(0, 8);
  const replyRate = k.contacted ? (k.replies / k.contacted) * 100 : 0;

  return (
    <div className="space-y-5">
      <AutoPanel id={id} status={status} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={ar.dashboard.kpis.total} value={k.total} />
        <Kpi label={ar.dashboard.kpis.ready} value={k.ready} />
        <Kpi label={ar.dashboard.kpis.sentToday} value={`${k.sentToday} / ${k.dailyLimit}`} />
        <Kpi label={ar.dashboard.kpis.week} value={k.week} />
        <Kpi label={ar.dashboard.kpis.replies} value={k.replies} tone="good" sub={`${ar.dashboard.replyRate}: ${pct(replyRate)}`} />
        <Kpi label={ar.dashboard.kpis.bounces} value={k.bounces} tone={k.bounces ? "bad" : undefined} />
        <Kpi label={ar.dashboard.kpis.bounceRate} value={pct(k.bounceRate)} tone={k.bounceRate > s.maxBounce ? "bad" : undefined} sub={`≤ ${s.maxBounce}%`} />
        <Kpi label={ar.dashboard.kpis.monday} value={<span>{k.mondaySynced} <span className="text-base text-rose-600">/ {k.mondayFailed}</span></span>} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title={ar.dashboard.chart} className="lg:col-span-2">
          <div className="flex h-44 items-end gap-1 sm:gap-1.5" role="img" aria-label={ar.dashboard.chart}>
            {chart.map((d) => (
              <div key={d.day} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 group-hover:opacity-100">{d.sent}</span>
                <div className="flex w-full flex-col-reverse overflow-hidden rounded-t" style={{ height: `${((d.sent + d.failed) / maxDay) * 100}%`, minHeight: d.sent + d.failed ? 3 : 0 }}>
                  <div className="bg-primary" style={{ flex: d.sent }} title={`${d.day}: ${d.sent}`} />
                  {!!d.failed && <div className="bg-rose-400" style={{ flex: d.failed }} />}
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{d.day.slice(8)}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={ar.dashboard.funnel}>
          {[
            { label: ar.dashboard.funnelSent, n: k.contacted },
            { label: ar.dashboard.funnelFollowups, n: k.followedUp },
            { label: ar.dashboard.funnelReplied, n: k.replies },
          ].map((f, i) => (
            <div key={f.label} className="mb-3">
              <div className="flex justify-between text-sm">
                <span>{f.label}</span>
                <span className="font-semibold tabular-nums">{f.n}</span>
              </div>
              <div className="mt-1 h-6 rounded bg-muted">
                <div className={`h-full rounded ${i === 2 ? "bg-emerald-500" : "bg-primary/70"}`} style={{ width: `${k.contacted ? Math.max(2, (f.n / k.contacted) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
          <p className="text-sm text-muted-foreground">{ar.dashboard.replyRate}: <b className="text-foreground">{pct(replyRate)}</b></p>
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title={ar.dashboard.warnings} actions={<SchedulerHealthBadge health={health} />}>
          {warns.length ? (
            <ul className="space-y-2">
              {warns.map((w, i) => (
                <li key={i} className={`flex items-start gap-2 text-sm ${w.level === "error" ? "text-rose-700" : "text-amber-800"}`}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {warningText(w.code, ...(w.code === "auto_stopped" ? [ar.autoOffReason[w.args?.[0] || ""] || w.args?.[0] || ""] : w.args || []))}
                    {["smtp_not_tested", "sender_not_configured", "imap_not_configured"].includes(w.code) && (
                      <Link href={`/c/${id}/settings?tab=sender`} className="ms-1 text-primary hover:underline">{ar.nav.settings}</Link>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="size-4" /> {ar.dashboard.noWarnings}</p>
          )}
          <div className="mt-4"><CheckInboxButton id={id} /></div>
        </Section>

        <Section title={ar.dashboard.nextRuns} actions={<Link href={`/c/${id}/send?tab=schedule`} className="text-xs text-primary hover:underline">{ar.send.schedule}</Link>}>
          {upcoming.length ? (
            <ul className="divide-y text-sm">
              {upcoming.map((r) => {
                const f = parseFilter(get(r, "Filter"));
                return (
                  <li key={get(r, "Run ID")} className="flex items-center justify-between gap-2 py-2">
                    <div>
                      <p className="font-medium">{fmtDate(get(r, "Run At"), s.tz)}</p>
                      <p className="text-xs text-muted-foreground">
                        {get(r, "Count")} · {f.tags?.join("، ") || f.language || ar.common.all}
                      </p>
                    </div>
                    <ScheduleBadge status={get(r, "Status") || "Pending"} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{ar.dashboard.noRuns}</p>
          )}
        </Section>

        <Section title={ar.dashboard.activity} actions={<Link href={`/c/${id}/activity`} className="text-xs text-primary hover:underline">{ar.nav.activity}</Link>}>
          <ul className="space-y-2 text-sm">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{fmtRelative(get(a, "Time"))}</span>
                <span className="min-w-0">
                  <span className="font-medium">{get(a, "Action")}</span>
                  <span className="ltr block truncate text-xs text-muted-foreground">{get(a, "Details")}</span>
                </span>
              </li>
            ))}
            {!activity.length && <li className="text-muted-foreground">{ar.common.empty}</li>}
          </ul>
        </Section>
      </div>
    </div>
  );
}
