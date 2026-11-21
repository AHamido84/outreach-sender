// Cron tick: scheduled one-off runs, the paced auto batch, the inbox check — per active company, within a time budget.
import { listCompanies, loadCompany, logActivity, setSystemValue } from "./company";
import { runBatchWith, type RunOutcome } from "./engine";
import { toErrorInfo } from "./errors";
import { checkInboxWith } from "./inbox-check";
import { TABS } from "./schema";
import { parseFilter } from "./selection";
import { get } from "./table";
import { parseDate } from "./time";

export type CronCompanyResult = {
  id: string;
  name: string;
  schedules: { runId: string; sent: number; status: string }[];
  auto?: { sent: number; stopped?: string };
  inbox?: { replies: number; bounces: number; unsubscribes: number; skipped?: string };
  error?: string;
};

const sentCount = (o: RunOutcome) => o.results.filter((r) => r.result === "Sent").length;

export async function runDueSchedules(companyId: string, deadline: number) {
  const ctx = await loadCompany(companyId, [TABS.schedule, TABS.sendLog]);
  const out: CronCompanyResult["schedules"] = [];
  const sched = ctx.t[TABS.schedule];
  const now = new Date();
  const due = sched.rows.filter((r) => {
    const st = get(r, "Status") || "Pending";
    const at = parseDate(get(r, "Run At"));
    return (st === "Pending" && at && at <= now) || st === "Running";
  });
  for (const row of due) {
    if (Date.now() > deadline) break;
    const runId = get(row, "Run ID");
    const count = Math.max(1, Number(get(row, "Count")) || 1);
    const already = ctx.t[TABS.sendLog].rows.filter((r) => get(r, "Run ID") === runId && get(r, "Result") === "Sent").length;
    const remaining = count - already;
    if (remaining <= 0) {
      ctx.w.update(sched, row, { Status: "Done", Result: `${already}/${count} sent` });
      await ctx.w.flush();
      out.push({ runId, sent: 0, status: "Done" });
      continue;
    }
    ctx.w.update(sched, row, { Status: "Running" });
    await ctx.w.flush();
    try {
      const o = await runBatchWith(ctx, { runType: "scheduled", runId, max: remaining, filter: parseFilter(get(row, "Filter")), deadline });
      const total = already + sentCount(o);
      const finished =
        total >= count || (o.planned === 0 && !["daily_limit", "locked"].includes(o.stopped || "")) || o.stopped === "sender_not_configured";
      const reason = o.stopped && !finished ? ` — ${o.stopped}` : o.stopped === "nothing_to_send" ? " — no eligible contacts" : "";
      ctx.w.update(sched, row, { Status: finished ? "Done" : "Running", Result: `${total}/${count} sent${reason}` });
      await ctx.w.flush();
      out.push({ runId, sent: sentCount(o), status: finished ? "Done" : "Running" });
    } catch (e) {
      const info = toErrorInfo(e);
      ctx.w.update(sched, row, { Status: "Failed", Result: `${info.code}: ${info.detail}`.slice(0, 300) });
      await ctx.w.flush();
      await logActivity(ctx, "Schedule failed", `${runId}: ${info.code} ${info.detail}`);
      out.push({ runId, sent: 0, status: "Failed" });
    }
  }
  return out;
}

export async function runCron(budgetMs = 50_000): Promise<{ at: string; companies: CronCompanyResult[] }> {
  const start = Date.now();
  const deadline = start + budgetMs;
  const at = new Date().toISOString();
  await setSystemValue("Last Cron At", at).catch(() => {});
  const companies = (await listCompanies()).filter((c) => c.active);
  const results: CronCompanyResult[] = [];
  for (const c of companies) {
    if (Date.now() > deadline - 3000) break; // stop early, continue next tick
    const r: CronCompanyResult = { id: c.id, name: c.name, schedules: [] };
    try {
      r.schedules = await runDueSchedules(c.id, deadline);
      if (Date.now() < deadline - 3000) {
        const ctx = await loadCompany(c.id, [TABS.sendLog]);
        const o = await runBatchWith(ctx, { runType: "auto", deadline });
        r.auto = { sent: sentCount(o), stopped: o.stopped };
      }
      if (Date.now() < deadline - 5000) {
        const ctx = await loadCompany(c.id);
        r.inbox = await checkInboxWith(ctx);
      }
    } catch (e) {
      const info = toErrorInfo(e);
      r.error = `${info.code}: ${info.detail}`;
      await logActivity({ sheetId: c.id }, "Cron error", r.error).catch(() => {});
    }
    results.push(r);
  }
  await setSystemValue("Last Cron Result", JSON.stringify(results.map((x) => ({ n: x.name, a: x.auto?.sent ?? 0, e: x.error ? 1 : 0 })))).catch(() => {});
  return { at, companies: results };
}
