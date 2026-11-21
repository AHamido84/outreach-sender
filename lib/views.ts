// Read models for pages: KPIs, chart, auto-sending status, warnings, scheduler health.
import { listCompanies, loadCompany, readRegistry, senderSettings, type Ctx, type CompanyRef } from "./company";
import { autoBlockers, bounceStats, countSentToday, senderReady } from "./engine";
import { toErrorInfo, type ErrorInfo } from "./errors";
import { mondayConfigured } from "./monday";
import { TABS } from "./schema";
import { isSentStatus } from "./selection";
import { get, type Row } from "./table";
import { dayKey, inWindow, nextWindowOpen, pacedAllowance, paceIntervalMinutes, parseDate } from "./time";

export type Warning = { code: string; args?: string[]; level: "warn" | "error" };

export type SchedulerHealth = { lastCronAt: string | null; stale: boolean };

export async function schedulerHealth(): Promise<SchedulerHealth> {
  try {
    const { system } = await readRegistry();
    const at = system.values["Last Cron At"] || null;
    const d = parseDate(at);
    return { lastCronAt: at, stale: !d || Date.now() - d.getTime() > 30 * 60_000 };
  } catch {
    return { lastCronAt: null, stale: true };
  }
}

export type AutoStatus = {
  on: boolean;
  state: "running" | "paused" | "outside_window" | "daily_limit" | "bounce_guard" | "sender_not_configured" | "stopped" | "blocked";
  offReason: string;
  blockers: string[];
  nextRun: string | null;
  sentToday: number;
  dailyLimit: number;
  lastRun: { at: string; id: string; result: string };
  readyCount: number;
  forecastDays: number;
  paceMinutes: number;
  tz: string;
};

export function autoStatus(ctx: Ctx, log: Row[], now = new Date()): AutoStatus {
  const s = senderSettings(ctx);
  const sentToday = countSentToday(log, now, s.tz);
  const blockers = autoBlockers(ctx, s);
  const offReason = ctx.sender.values["Auto Off Reason"] || "";
  const readyCount = ctx.t[TABS.contacts].rows.filter((r) => get(r, "Status") === "Ready").length;
  const perDay = s.dailyLimit * (s.window.days.length / 7);
  const forecastDays = readyCount && perDay ? Math.ceil(readyCount / perDay) : 0;
  let state: AutoStatus["state"];
  if (!senderReady(s)) state = "sender_not_configured";
  else if (!s.auto) state = offReason === "bounce_rate" ? "bounce_guard" : offReason ? "stopped" : "paused";
  else if (blockers.length) state = "blocked";
  else if (sentToday >= s.dailyLimit) state = "daily_limit";
  else if (!inWindow(now, s.window)) state = "outside_window";
  else state = "running";

  // Next run: first 5-minute slot where the pacing allows a send (today's count carries until the day changes).
  let nextRun: string | null = null;
  if (s.auto && !blockers.length && s.dailyLimit > 0) {
    const today = dayKey(now, s.tz);
    const step = 5 * 60_000;
    let t = now.getTime();
    for (let i = 0; i < (8 * 24 * 60) / 5; i++, t += step) {
      const d = new Date(t);
      const sent = dayKey(d, s.tz) === today ? sentToday : 0;
      if (pacedAllowance({ now: d, w: s.window, dailyLimit: s.dailyLimit, sentToday: sent, perRun: s.perRun }) > 0) {
        nextRun = d.toISOString();
        break;
      }
    }
    if (!nextRun) nextRun = nextWindowOpen(now, s.window)?.toISOString() || null;
  }
  return {
    on: s.auto, state, offReason, blockers, nextRun, sentToday, dailyLimit: s.dailyLimit,
    lastRun: { at: ctx.sender.values["Last Run At"] || "", id: ctx.sender.values["Last Run ID"] || "", result: ctx.sender.values["Last Run Result"] || "" },
    readyCount, forecastDays, paceMinutes: paceIntervalMinutes(s.window, s.dailyLimit), tz: s.tz,
  };
}

export function warnings(ctx: Ctx, health?: SchedulerHealth): Warning[] {
  const s = senderSettings(ctx);
  const out: Warning[] = [];
  if (!senderReady(s)) out.push({ code: "sender_not_configured", level: "error" });
  else if (!s.smtpTestedAt) out.push({ code: "smtp_not_tested", level: "warn" });
  if (!s.imap.host) out.push({ code: "imap_not_configured", level: "warn" });
  const contacts = ctx.t[TABS.contacts].rows;
  const mFail = contacts.filter((r) => get(r, "monday Status").startsWith("Failed")).length;
  if (mFail && mondayConfigured(ctx)) out.push({ code: "monday_failing", args: [String(mFail)], level: "warn" });
  const b = bounceStats(contacts);
  if (b.sent >= 20 && b.rate > s.maxBounce) out.push({ code: "bounce_high", args: [b.rate.toFixed(1), String(s.maxBounce)], level: "error" });
  const off = ctx.sender.values["Auto Off Reason"];
  if (!s.auto && off) out.push({ code: "auto_stopped", args: [off], level: "error" });
  else if (!s.auto) out.push({ code: "auto_off", level: "warn" });
  if (s.auto) for (const bl of autoBlockers(ctx, s)) if (bl.startsWith("no_template")) out.push({ code: bl, level: "error" });
  if (health && s.auto) out.push(...(health.stale ? [{ code: health.lastCronAt ? "scheduler_stale" : "scheduler_never", level: "error" as const }] : []));
  return out;
}

export type Kpis = {
  total: number; ready: number; sentToday: number; dailyLimit: number; week: number; replies: number; bounces: number;
  bounceRate: number; mondaySynced: number; mondayFailed: number; contacted: number; followedUp: number;
};

export function kpis(ctx: Ctx, log: Row[], now = new Date()): Kpis {
  const s = senderSettings(ctx);
  const contacts = ctx.t[TABS.contacts].rows;
  const weekAgo = now.getTime() - 7 * 86400_000;
  const b = bounceStats(contacts);
  return {
    total: contacts.length,
    ready: contacts.filter((r) => get(r, "Status") === "Ready").length,
    sentToday: countSentToday(log, now, s.tz),
    dailyLimit: s.dailyLimit,
    week: log.filter((r) => get(r, "Result") === "Sent" && (parseDate(get(r, "Time"))?.getTime() || 0) >= weekAgo).length,
    replies: contacts.filter((r) => get(r, "Status") === "Replied").length,
    bounces: b.bounced,
    bounceRate: b.rate,
    mondaySynced: contacts.filter((r) => get(r, "monday Status") === "Synced").length,
    mondayFailed: contacts.filter((r) => get(r, "monday Status").startsWith("Failed")).length,
    contacted: b.sent,
    followedUp: contacts.filter((r) => Number(get(r, "Step")) >= 1 || (isSentStatus(get(r, "Status")) && get(r, "Status") !== "Sent")).length,
  };
}

export function sendsPerDay(log: Row[], tz: string, days = 14, now = new Date()): { day: string; sent: number; failed: number }[] {
  const out: { day: string; sent: number; failed: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(now.getTime() - i * 86400_000), tz);
    idx.set(k, out.length);
    out.push({ day: k, sent: 0, failed: 0 });
  }
  for (const r of log) {
    const d = parseDate(get(r, "Time"));
    if (!d) continue;
    const i = idx.get(dayKey(d, tz));
    if (i === undefined) continue;
    if (get(r, "Result") === "Sent") out[i].sent++;
    else if (get(r, "Result") === "Failed") out[i].failed++;
  }
  return out;
}

export type CompanyCard = {
  ref: CompanyRef;
  sentToday?: number;
  dailyLimit?: number;
  auto?: boolean;
  lastRun?: string;
  lastRunResult?: string;
  warnings: Warning[];
  error?: ErrorInfo;
};

export async function companyCards(): Promise<{ cards: CompanyCard[]; health: SchedulerHealth }> {
  const [refs, health] = await Promise.all([listCompanies(), schedulerHealth()]);
  const cards = await Promise.all(
    refs.map(async (ref): Promise<CompanyCard> => {
      try {
        const ctx = await loadCompany(ref.id, [TABS.sendLog]);
        const s = senderSettings(ctx);
        return {
          ref,
          sentToday: countSentToday(ctx.t[TABS.sendLog].rows, new Date(), s.tz),
          dailyLimit: s.dailyLimit,
          auto: s.auto,
          lastRun: ctx.sender.values["Last Run At"],
          lastRunResult: ctx.sender.values["Last Run Result"],
          warnings: warnings(ctx, health),
        };
      } catch (e) {
        return { ref, warnings: [], error: toErrorInfo(e) };
      }
    }),
  );
  return { cards, health };
}
