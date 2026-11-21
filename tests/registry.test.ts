import { describe, expect, it } from "vitest";
import { MemorySheetStore } from "@/lib/sheets/memory";
import { setStore } from "@/lib/sheets";
import { companyCards } from "@/lib/views";
import { listCompanies } from "@/lib/company";

describe("registry bootstrap", () => {
  it("creates Companies/System tabs on an empty registry sheet, even with concurrent reads", async () => {
    process.env.DEMO = "";
    process.env.REGISTRY_SHEET_ID = "emptyRegistry000000000000000001";
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{}";
    const mem = new MemorySheetStore();
    mem.createBook("emptyRegistry000000000000000001", "Registry");
    await mem.batchUpdate("emptyRegistry000000000000000001", [{ addSheet: { properties: { title: "Sheet1" } } }]);
    setStore(mem);
    const { cards } = await companyCards();
    expect(cards).toEqual([]);
    expect(await listCompanies()).toEqual([]);
    const meta = await mem.getMeta("emptyRegistry000000000000000001");
    expect(meta.tabs.map((t) => t.title).sort()).toEqual(["Companies", "Sheet1", "System"]);
  });
});
