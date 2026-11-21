import { beforeAll, describe, expect, it } from "vitest";

process.env.DEMO = "1";

import { loadCompany } from "@/lib/company";
import { demoState } from "@/lib/demo/fakes";
import { DEMO_A, DEMO_B, getDemoStore } from "@/lib/demo/seed";
import { countSentToday, runBatch } from "@/lib/engine";
import { checkInbox } from "@/lib/inbox-check";
import { initializeSheet } from "@/lib/init";
import { ALL_TABS, TABS } from "@/lib/schema";
import { getStore } from "@/lib/sheets";
import { get } from "@/lib/table";

beforeAll(() => {
  getDemoStore();
});

describe("engine (demo store)", () => {
  it("sends a manual batch: follow-ups first, row + log updated, same thread", async () => {
    const before = await loadCompany(DEMO_A, [TABS.sendLog]);
    const sentBefore = countSentToday(before.t[TABS.sendLog].rows, new Date(), "Asia/Riyadh");
    const out = await runBatch(DEMO_A, { runType: "manual", max: 3, sleepBetween: false });
    const sent = out.results.filter((r) => r.result === "Sent");
    expect(sent.length + out.results.filter((r) => r.result === "Failed").length).toBeGreaterThan(0);
    const ctx = await loadCompany(DEMO_A, [TABS.sendLog]);
    expect(countSentToday(ctx.t[TABS.sendLog].rows, new Date(), "Asia/Riyadh")).toBe(sentBefore + sent.length);
    const fu = sent.find((r) => r.step > 0);
    expect(fu).toBeTruthy();
    expect(fu!.subject!.startsWith("Re: ")).toBe(true);
    const row = ctx.t[TABS.contacts].rows.find((r) => get(r, "ID") === fu!.contactId)!;
    expect(get(row, "Last Message ID")).toBe(fu!.messageId);
    expect(get(row, "Thread References").split(" ").length).toBe(fu!.step + 1);
    expect(get(row, "monday Status")).toBe("Synced");
  });

  it("refuses to send when a variable is empty", async () => {
    // C0050 has an empty Industry, used by {industry} in the step-0 templates.
    const out = await runBatch(DEMO_A, { runType: "manual", max: 1, filter: { ids: ["C0050"] }, sleepBetween: false, overrideWindow: true });
    expect(out.results[0].result).toBe("Skipped");
    expect(out.results[0].missing).toContain("industry");
  });

  it("never exceeds the daily limit", async () => {
    const out = await runBatch(DEMO_A, { runType: "manual", max: 500, sleepBetween: false });
    expect(out.sentToday).toBeLessThanOrEqual(30);
    const again = await runBatch(DEMO_A, { runType: "manual", max: 5, sleepBetween: false });
    if (out.sentToday >= 30) expect(again.stopped).toBe("daily_limit");
  });

  it("detects replies and bounces from the inbox", async () => {
    demoState().inbox.forEach((m) => (m.arriveAt = 0));
    const res = await checkInbox(DEMO_A);
    expect(res.checked).toBeGreaterThanOrEqual(0);
    const ctx = await loadCompany(DEMO_A);
    const bounced = ctx.t[TABS.contacts].rows.filter((r) => get(r, "Status") === "Bounced");
    expect(bounced.length).toBeGreaterThanOrEqual(2);
  });

  it("company B: auto is blocked (sender not configured)", async () => {
    const out = await runBatch(DEMO_B, { runType: "auto" });
    expect(out.stopped).toBe("sender_not_configured");
  });

  it("initialize creates all tabs on an empty sheet and is idempotent", async () => {
    const id = "freshSheet00000000000000000001";
    const r1 = await initializeSheet(id);
    expect(r1.createdTabs.sort()).toEqual([...ALL_TABS].sort());
    const r2 = await initializeSheet(id);
    expect(r2.createdTabs).toEqual([]);
    expect(r2.addedKeys).toEqual([]);
    const meta = await getStore().getMeta(id);
    expect(meta.tabs.filter((t) => t.title === TABS.contacts)[0].rightToLeft).toBe(true);
  });
});
