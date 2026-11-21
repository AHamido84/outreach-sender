"use server";
import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { loadCompany, logActivity, senderSettings } from "@/lib/company";
import { newRunId, runBatch } from "@/lib/engine";
import { AppError } from "@/lib/errors";
import { checkInbox } from "@/lib/inbox-check";
import { TABS } from "@/lib/schema";
import { formatFilter, type Filter } from "@/lib/selection";
import { get } from "@/lib/table";
import { inWindow, zonedToUtc } from "@/lib/time";

export async function previewRun(id: string, input: { max: number; filter?: Filter }) {
  return act(async () => {
    await requireSession();
    const out = await runBatch(id, { runType: "manual", max: Math.max(1, Math.min(500, input.max || 1)), filter: input.filter, dryRun: true });
    const ctx = await loadCompany(id);
    const s = senderSettings(ctx);
    return { ...out, runId: newRunId("manual"), inWindow: inWindow(new Date(), s.window), delaySec: s.delaySec };
  });
}

/** Client-driven manual sending: one contact per call, so each request stays well inside the function time limit. */
export async function sendOne(id: string, input: { runId: string; contactId: string; overrideWindow: boolean }) {
  return act(async () => {
    await requireSession();
    const out = await runBatch(id, {
      runType: "manual", runId: input.runId, max: 1, filter: { ids: [input.contactId] }, overrideWindow: input.overrideWindow, sleepBetween: false,
    });
    return { result: out.results[0] || null, stopped: out.stopped || null, sentToday: out.sentToday, dailyLimit: out.dailyLimit };
  });
}

export async function finishManualRun(id: string, input: { runId: string; sent: number; failed: number; total: number }) {
  return act(async () => {
    await requireSession();
    await logActivity({ sheetId: id }, "Run manual", `${input.runId}: sent ${input.sent}/${input.total}, failed ${input.failed}`);
    revalidatePath(`/c/${id}`, "layout");
    return true;
  });
}

export async function runNow(id: string) {
  return act(async () => {
    await requireSession();
    const out = await runBatch(id, { runType: "auto", runNow: true, deadline: Date.now() + 45_000 });
    revalidatePath(`/c/${id}`, "layout");
    return out;
  });
}

export async function checkInboxNow(id: string) {
  return act(async () => {
    await requireSession();
    const r = await checkInbox(id);
    revalidatePath(`/c/${id}`, "layout");
    return r;
  });
}

export async function addSchedule(id: string, input: { runAt: string; count: number; filter: Filter }) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id, [TABS.schedule]);
    const s = senderSettings(ctx);
    const at = zonedToUtc(input.runAt, s.tz);
    if (!at || !(input.count > 0)) throw new AppError("invalid_input");
    const runId = newRunId("scheduled");
    ctx.w.append(ctx.t[TABS.schedule], {
      "Run ID": runId, "Run At": at.toISOString(), Count: String(Math.round(input.count)), Filter: formatFilter(input.filter),
      Status: "Pending", Result: "", "Created At": new Date().toISOString(),
    });
    await ctx.w.flush();
    await logActivity(ctx, "Schedule added", `${runId} at ${at.toISOString()} count ${input.count} ${formatFilter(input.filter)}`);
    revalidatePath(`/c/${id}`, "layout");
    return { runId };
  });
}

export async function cancelSchedule(id: string, runId: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id, [TABS.schedule]);
    const t = ctx.t[TABS.schedule];
    const row = t.rows.find((r) => get(r, "Run ID") === runId);
    if (!row) throw new AppError("invalid_input");
    ctx.w.update(t, row, { Status: "Cancelled" });
    await ctx.w.flush();
    await logActivity(ctx, "Schedule cancelled", runId);
    revalidatePath(`/c/${id}`, "layout");
    return true;
  });
}
