"use server";
import { revalidatePath } from "next/cache";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { loadCompany, logActivity, senderSettings } from "@/lib/company";
import { buildDnc, classifyImport, cleanEmail, isBlocked, isValidEmail, type DedupOptions } from "@/lib/emails";
import { AppError } from "@/lib/errors";
import { IMPORT_FIELDS } from "@/lib/import-map";
import { mondayConfig, syncContactToMonday } from "@/lib/monday";
import { TABS } from "@/lib/schema";
import { getStore } from "@/lib/sheets";
import { get, type Row } from "@/lib/table";
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
    if (!ids.length) return { count: 0 };
    const ctx = await loadCompany(id);
    const t = ctx.t[TABS.contacts];
    const rows = t.rows.filter((r) => ids.includes(get(r, "ID")));
    let count = 0;
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
    return { count };
  });
}

// ---------- Import ----------

type ImportRow = Partial<Record<(typeof IMPORT_FIELDS)[number], string>>;

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

function dedupOptions(ctx: Awaited<ReturnType<typeof loadCompany>>, opts?: DedupOptions): DedupOptions {
  const s = senderSettings(ctx);
  return { allowSameDomain: opts?.allowSameDomain ?? s.allowSameDomain, allowResend: opts?.allowResend ?? s.allowResend };
}

export async function previewImport(id: string, rows: ImportRow[], opts?: DedupOptions) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const existing = ctx.t[TABS.contacts].rows.map((r) => ({ email: get(r, "Email"), website: get(r, "Website") }));
    const dnc = buildDnc(ctx.t[TABS.dnc].rows.map((r) => get(r, "Email or Domain")));
    const checks = classifyImport(rows.map((r) => ({ email: r.Email || "", website: r.Website })), existing, dnc, dedupOptions(ctx, opts));
    const counts = { valid: 0, invalid: 0, duplicate: 0, dnc: 0 };
    checks.forEach((c) => counts[c.status]++);
    return { counts, checks };
  });
}

function nextIdFactory(rows: Row[]) {
  let max = 0;
  for (const r of rows) {
    const m = get(r, "ID").match(/^C(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return () => `C${String(++max).padStart(4, "0")}`;
}

export async function appendImport(
  id: string,
  input: { rows: ImportRow[]; source: string; mapping: Record<string, string>; initialStatus: "Ready" | "New"; includeBad: boolean } & DedupOptions,
) {
  return act(async () => {
    await requireSession();
    if (input.rows.length > 5000) throw new AppError("invalid_input", "max 5000 rows");
    const ctx = await loadCompany(id, [TABS.mappings]);
    const t = ctx.t[TABS.contacts];
    const existing = t.rows.map((r) => ({ email: get(r, "Email"), website: get(r, "Website") }));
    const dnc = buildDnc(ctx.t[TABS.dnc].rows.map((r) => get(r, "Email or Domain")));
    const checks = classifyImport(input.rows.map((r) => ({ email: r.Email || "", website: r.Website })), existing, dnc, dedupOptions(ctx, input));
    const nextId = nextIdFactory(t.rows);
    const now = new Date().toISOString();
    const added: Row[] = [];
    input.rows.forEach((r, i) => {
      const c = checks[i];
      if (c.status !== "valid" && !input.includeBad) return;
      if (c.status === "dnc") return; // never import blocked contacts
      const obj: Record<string, string> = {};
      for (const f of IMPORT_FIELDS) obj[f] = String(r[f] ?? "").trim();
      obj.ID = nextId();
      obj["Added At"] = now;
      obj.Source = obj.Source || input.source || "Import";
      obj.Email = c.email;
      obj.Language = normalizeLanguage(obj.Language);
      obj.Status = c.status === "valid" ? input.initialStatus : c.status === "invalid" ? "Invalid" : "Duplicate";
      if (c.status !== "valid") obj.Error = c.reason || "";
      added.push(ctx.w.append(t, obj));
    });
    // Remember the mapping for this source
    if (input.source.trim()) {
      const mt = ctx.t[TABS.mappings];
      const row = mt.rows.find((r) => get(r, "Source").toLowerCase() === input.source.trim().toLowerCase());
      const json = JSON.stringify(input.mapping);
      if (row) ctx.w.update(mt, row, { Mapping: json, "Updated At": now });
      else ctx.w.append(mt, { Source: input.source.trim(), Mapping: json, "Updated At": now });
    }
    await ctx.w.flush();
    // monday: create items at import when configured (bounded time; the rest can be retried from the table)
    let mondayCreated = 0;
    const m = mondayConfig(ctx);
    if (m.createOn === "import" && m.token && m.boardId) {
      // Re-load so rows have their real sheet positions.
      const fresh = await loadCompany(id);
      const ids = new Set(added.map((a) => get(a, "ID")));
      const deadline = Date.now() + 35_000;
      for (const r of fresh.t[TABS.contacts].rows.filter((x) => ids.has(get(x, "ID")) && get(x, "Status") !== "Invalid")) {
        if (Date.now() > deadline) break;
        const res = await syncContactToMonday(fresh, r, "import");
        if (res.ok && !res.skipped) mondayCreated++;
        if (fresh.w.pending > 20) await fresh.w.flush();
      }
      await fresh.w.flush();
    }
    const counts = { valid: 0, invalid: 0, duplicate: 0, dnc: 0 };
    checks.forEach((c) => counts[c.status]++);
    await logActivity(
      ctx,
      "Import",
      `${added.length} contacts added from ${input.source || "import"} (valid ${counts.valid}, invalid ${counts.invalid}, duplicate ${counts.duplicate}, dnc ${counts.dnc})${mondayCreated ? `, monday ${mondayCreated}` : ""}`,
    );
    revalidatePath(`/c/${id}`, "layout");
    return { added: added.length, counts, mondayCreated };
  });
}
