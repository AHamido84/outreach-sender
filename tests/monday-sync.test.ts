import { describe, expect, it } from "vitest";

process.env.DEMO = "1";

const { loadCompany } = await import("@/lib/company");
const { DEMO_A, getDemoStore } = await import("@/lib/demo/seed");
const { syncContactToMonday } = await import("@/lib/monday");
const { demoState } = await import("@/lib/demo/fakes");
const { TABS } = await import("@/lib/schema");
const { get } = await import("@/lib/table");

getDemoStore();

describe("monday sync fallback", () => {
  it("creates the item and sets the other columns when one column value is rejected", async () => {
    const ctx = await loadCompany(DEMO_A);
    const c = ctx.t[TABS.contacts].rows.find((r) => get(r, "ID") === "C0050")!;
    ctx.w.update(ctx.t[TABS.contacts], c, { Email: "mfail@x-co.com", "monday Item ID": "", Company: "شركة اختبار" });
    await ctx.w.flush();
    const fresh = await loadCompany(DEMO_A);
    const row = fresh.t[TABS.contacts].rows.find((r) => get(r, "ID") === "C0050")!;
    const r = await syncContactToMonday(fresh, row, "send");
    await fresh.w.flush();
    expect(r.ok).toBe(false);
    expect(r.itemId).toBeTruthy(); // item still created
    expect(r.error).toContain("Email: ColumnValueException");
    const item = demoState().boards.get("1234567890")!.items.get(r.itemId!)!;
    expect(item.name).toBe("شركة اختبار");
    expect(Object.keys(item.values)).toContain("text_company"); // other columns synced
    const after = (await loadCompany(DEMO_A)).t[TABS.contacts].rows.find((x) => get(x, "ID") === "C0050")!;
    expect(get(after, "monday Item ID")).toBe(r.itemId);
    expect(get(after, "monday Status")).toMatch(/^Failed: Email:/);
  });
});
