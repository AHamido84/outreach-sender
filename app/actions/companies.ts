"use server";
import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { listCompanies, logActivity, readRegistry } from "@/lib/company";
import { registrySheetId } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";
import { initializeSheet } from "@/lib/init";
import { REGISTRY_TABS } from "@/lib/schema";
import { getStore } from "@/lib/sheets";
import { parseSheetId } from "@/lib/sheets/types";
import { get, Writer } from "@/lib/table";

export async function testAccess(url: string) {
  return act(async () => {
    await requireSession();
    const id = parseSheetId(url);
    const store = getStore();
    if (!id) throw new AppError("invalid_url");
    try {
      const meta = await store.getMeta(id);
      return { ok: true as const, id, title: meta.title, serviceAccount: store.serviceAccountEmail(), tabs: meta.tabs.map((t) => t.title) };
    } catch (e) {
      if ((isAppError(e, "sheet_no_access") || isAppError(e, "sheet_not_found")))
        return { ok: false as const, id, code: e.code, serviceAccount: store.serviceAccountEmail() };
      throw e;
    }
  });
}

export async function addCompany(input: { name: string; url: string; color: string }) {
  return act(async () => {
    await requireSession();
    const id = parseSheetId(input.url);
    if (!id || !input.name.trim()) throw new AppError("invalid_input");
    const existing = await listCompanies();
    if (existing.some((c) => c.id === id)) throw new AppError("exists");
    const report = await initializeSheet(id);
    const { companies } = await readRegistry();
    const w = new Writer(getStore(), registrySheetId());
    w.append(companies, {
      Name: input.name.trim(),
      "Sheet URL": `https://docs.google.com/spreadsheets/d/${id}/edit`,
      Color: input.color || "#0f766e",
      Active: "yes",
    });
    await w.flush();
    revalidatePath("/");
    return { id, report };
  });
}

export async function repairSheet(id: string) {
  return act(async () => {
    await requireSession();
    const report = await initializeSheet(id);
    revalidatePath(`/c/${id}`, "layout");
    return report;
  });
}

export async function removeCompany(id: string) {
  return act(async () => {
    await requireSession();
    const { companies } = await readRegistry();
    const row = companies.rows.find((r) => parseSheetId(get(r, "Sheet URL")) === id);
    if (!row) throw new AppError("company_not_found");
    const meta = await getStore().getMeta(registrySheetId());
    const tab = meta.tabs.find((t) => t.title === REGISTRY_TABS.companies)!;
    await getStore().batchUpdate(registrySheetId(), [
      { deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: row._row - 1, endIndex: row._row } } },
    ]);
    await logActivity({ sheetId: id }, "Removed from registry", get(row, "Name"));
    revalidatePath("/");
    return true;
  });
}

export async function setCompanyActive(id: string, active: boolean) {
  return act(async () => {
    await requireSession();
    const { companies } = await readRegistry();
    const row = companies.rows.find((r) => parseSheetId(get(r, "Sheet URL")) === id);
    if (!row) throw new AppError("company_not_found");
    const w = new Writer(getStore(), registrySheetId());
    w.update(companies, row, { Active: active ? "yes" : "no" });
    await w.flush();
    revalidatePath("/");
    return true;
  });
}
