"use server";
import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { loadCompany, logActivity } from "@/lib/company";
import { buildDnc, cleanEmail, isBlocked, isValidEmail, type DedupOptions } from "@/lib/emails";
import { AppError } from "@/lib/errors";
import { IMPORT_FIELDS } from "@/lib/import-map";
import { syncContactToMonday } from "@/lib/monday";
import { appendContactRows, checkRows, countChecks, type ImportRow } from "@/lib/import-core";
import { TABS } from "@/lib/schema";
import { getStore } from "@/lib/sheets";
import { get } from "@/lib/table";
import { normalizeLanguage } from "@/lib/template";

const EDITABLE = [...IMPORT_FIELDS, "Status", "Next Send At"];

export async function updateContact(id: string, contactId: string, patch: Record<string, string>) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const t = ctx.t[TABS.contacts];
    const row = t.rows.find((r) => get(r, "ID") === contactId);
    if (!row) throw new AppError("invalid_input", "contact not found");
    const clean: Record<string, string> = {};
    for (const k of EDITABLE) if (k in patch) clean[k] = String(patch[k] ?? "").trim();
    if ("Email" in clean) clean.Email = cleanEmail(clean.Email, clean.Website ?? get(row, "Website")).email;
    if ("Language" in clean && clean.Language) clean.Language = normalizeLanguage(clean.Language);
    const changed = ctx.w.update(t, row, clean);
    await ctx.w.flush();
    if (changed.length) await logActivity(ctx, "Contact edited", `${contactId}: ${changed.join(", ")}`);
    revalidatePath(`/c/${id}/contacts`);
    return { changed };
  });
}

export async function bulkAction(id: string, ids: string[], action: "tags" | "ready" | "restart" | "dnc" | "monday" | "delete", arg = "") {
  return act(async () => {
    await requireSession();
    if (!ids.length) return { count: 0, errors: [] as string[] };
    const ctx = await loadCompany(id);
    const t = ctx.t[TABS.contacts];
    const rows = t.rows.filter((r) => ids.includes(get(r, "ID")));
    let count = 0;
    const errors: string[] = [];
    if (action === "tags") {
      for (const r of rows) count += ctx.w.update(t, r, { Tags: arg.split(/[,،]/).map((x) => x.trim()).filter(Boolean).join(", ") }).length ? 1 : 0;
    } else if (action === "ready") {
      for (const r of rows) {
        const st = get(r, "Status") || "New";
        if (["New", "Invalid", "Duplicate", ""].includes(st) && isValidEmail(get(r, "Email"))) count += ctx.w.update(t, r, { Status: "Ready", Error: "" }).length ? 1 : 0;
      }
    } else if (action === "restart") {
      // Start the sequence again from the first email. Bounced, unsubscribed and Do Not Contact are never restarted.
      const dncSet = buildDnc(ctx.t[TABS.dnc].rows.map((r) => get(r, "Email or Domain")));
      for (const r of rows) {
        const st = get(r, "Status");
        if (["Bounced", "Unsubscribed", "Invalid"].includes(st) || !isValidEmail(get(r, "Email")) || isBlocked(get(r, "Email"), dncSet)) continue;
        const changed = ctx.w.update(t, r, {
          Status: "Ready", Step: "", Version: "", "Next Send At": "", "Last Message ID": "", "Thread References": "", Error: "",
        });
        if (changed.length) count++;
      }
    } else if (action === "dnc") {
      const dnc = ctx.t[TABS.dnc];
      const have = new Set(dnc.rows.map((r) => get(r, "Email or Domain").toLowerCase()));
      for (const r of rows) {
        const e = get(r, "Email").toLowerCase().trim();
        if (e && !have.has(e)) {
          ctx.w.append(dnc, { "Email or Domain": e, Reason: arg || "Manual", "Added At": new Date().toISOString() });
          have.add(e);
          count++;
        }
        ctx.w.update(t, r, { "Next Send At": "" });
      }
    } else if (action === "monday") {
      const deadline = Date.now() + 40_000;
      for (const r of rows) {
        if (Date.now() > deadline) break;
        const res = await syncContactToMonday(ctx, r, "retry");
        if (res.ok && !res.skipped) count++;
        else if (!res.ok && res.error) errors.push(res.error);
      }
    } else if (action === "delete") {
      const meta = await getStore().getMeta(id);
      const tab = meta.tabs.find((x) => x.title === TABS.contacts)!;
      const reqs = rows
        .map((r) => r._row)
        .sort((a, b) => b - a)
        .map((rn) => ({ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: rn - 1, endIndex: rn } } }));
      await ctx.w.flush();
      await getStore().batchUpdate(id, reqs);
      count = rows.length;
    }
    await ctx.w.flush();
    await logActivity(ctx, `Bulk: ${action}`, `${count}/${ids.length} contacts${arg ? ` (${arg})` : ""}`);
    revalidatePath(`/c/${id}/contacts`);
    return { count, errors };
  });
}

// ---------- Import ----------


export async function getSavedMapping(id: string, source: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id, [TABS.mappings]);
    const row = ctx.t[TABS.mappings].rows.find((r) => get(r, "Source").toLowerCase() === source.trim().toLowerCase());
    if (!row) return null;
    try {
      return JSON.parse(get(row, "Mapping")) as Record<string, string>;
    } catch {
      return null;
    }
  });
}

export async function previewImport(id: string, rows: ImportRow[], opts?: DedupOptions) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const checks = checkRows(ctx, rows, opts);
    return { counts: countChecks(checks), checks };
  });
}


export async function appendImport(
  id: string,
  input: { rows: ImportRow[]; source: string; mapping: Record<string, string>; initialStatus: "Ready" | "New"; includeBad: boolean } & DedupOptions,
) {
  return act(async () => {
    await requireSession();
    if (input.rows.length > 5000) throw new AppError("invalid_input", "max 5000 rows");
    const ctx = await loadCompany(id, [TABS.mappings]);
    // Remember the mapping for this source
    if (input.source.trim()) {
      const now = new Date().toISOString();
      const mt = ctx.t[TABS.mappings];
      const row = mt.rows.find((r) => get(r, "Source").toLowerCase() === input.source.trim().toLowerCase());
      const json = JSON.stringify(input.mapping);
      if (row) ctx.w.update(mt, row, { Mapping: json, "Updated At": now });
      else ctx.w.append(mt, { Source: input.source.trim(), Mapping: json, "Updated At": now });
    }
    const r = await appendContactRows(ctx, input.rows, { ...input, source: input.source });
    revalidatePath(`/c/${id}`, "layout");
    return { added: r.added, counts: r.counts, mondayCreated: r.mondayCreated };
  });
}
