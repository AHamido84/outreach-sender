// Shared "add contacts" pipeline: dedup + Do Not Contact + IDs + monday (used by file import and external sources).
import { loadCompany, logActivity, senderSettings, type Ctx } from "./company";
import { buildDnc, classifyImport, type DedupOptions, type ImportCheck } from "./emails";
import { IMPORT_FIELDS, type ImportField } from "./import-map";
import { mondayConfig, syncContactToMonday } from "./monday";
import { TABS } from "./schema";
import type { Found } from "./sources/types";
import { get, type Row } from "./table";
import { normalizeLanguage } from "./template";

export type ImportRow = Partial<Record<ImportField, string>>;

export type AppendOptions = DedupOptions & {
  source: string;
  initialStatus: "Ready" | "New";
  includeBad?: boolean;
  tags?: string;
  activityLabel?: string;
};

export function dedupOptions(ctx: Ctx, opts?: DedupOptions): DedupOptions {
  const s = senderSettings(ctx);
  return { allowSameDomain: opts?.allowSameDomain ?? s.allowSameDomain, allowResend: opts?.allowResend ?? s.allowResend };
}

export function checkRows(ctx: Ctx, rows: ImportRow[], opts?: DedupOptions): ImportCheck[] {
  const existing = ctx.t[TABS.contacts].rows.map((r) => ({ email: get(r, "Email"), website: get(r, "Website") }));
  const dnc = buildDnc(ctx.t[TABS.dnc].rows.map((r) => get(r, "Email or Domain")));
  return classifyImport(rows.map((r) => ({ email: r.Email || "", website: r.Website })), existing, dnc, dedupOptions(ctx, opts));
}

export function countChecks(checks: ImportCheck[]) {
  const counts = { valid: 0, invalid: 0, duplicate: 0, dnc: 0 };
  checks.forEach((c) => counts[c.status]++);
  return counts;
}

function nextIdFactory(rows: Row[]) {
  let max = 0;
  for (const r of rows) {
    const m = get(r, "ID").match(/^C(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return () => `C${String(++max).padStart(4, "0")}`;
}

function mergeTags(a: string, b: string): string {
  const out: string[] = [];
  for (const t of `${a},${b}`.split(/[,،]/).map((x) => x.trim()).filter(Boolean)) if (!out.includes(t)) out.push(t);
  return out.join(", ");
}

/** Append rows to Contacts. Rows in Do Not Contact are never added. Writes are flushed by the caller via ctx.w (done here). */
export async function appendContactRows(ctx: Ctx, rows: ImportRow[], opts: AppendOptions) {
  const t = ctx.t[TABS.contacts];
  const checks = checkRows(ctx, rows, opts);
  const nextId = nextIdFactory(t.rows);
  const now = new Date().toISOString();
  const added: Row[] = [];
  rows.forEach((r, i) => {
    const c = checks[i];
    if (c.status === "dnc") return;
    if (c.status !== "valid" && !opts.includeBad) return;
    const obj: Record<string, string> = {};
    for (const f of IMPORT_FIELDS) obj[f] = String(r[f] ?? "").trim();
    obj.ID = nextId();
    obj["Added At"] = now;
    obj.Source = obj.Source || opts.source || "Import";
    obj.Email = c.email;
    obj.Language = normalizeLanguage(obj.Language);
    obj.Tags = mergeTags(obj.Tags || "", opts.tags || "");
    obj.Status = c.status === "valid" ? opts.initialStatus : c.status === "invalid" ? "Invalid" : "Duplicate";
    if (c.status !== "valid") obj.Error = c.reason || "";
    added.push(ctx.w.append(t, obj));
  });
  await ctx.w.flush();

  // monday: create items at import when configured (bounded time; the rest can be retried from the table)
  let mondayCreated = 0;
  const m = mondayConfig(ctx);
  if (added.length && m.createOn === "import" && m.token && m.boardId) {
    const fresh = await loadCompany(ctx.sheetId);
    const ids = new Set(added.map((a) => get(a, "ID")));
    const deadline = Date.now() + 30_000;
    for (const r of fresh.t[TABS.contacts].rows.filter((x) => ids.has(get(x, "ID")) && get(x, "Status") !== "Invalid")) {
      if (Date.now() > deadline) break;
      const res = await syncContactToMonday(fresh, r, "import");
      if (res.ok && !res.skipped) mondayCreated++;
      if (fresh.w.pending > 20) await fresh.w.flush();
    }
    await fresh.w.flush();
  }
  const counts = countChecks(checks);
  await logActivity(
    ctx,
    opts.activityLabel || "Import",
    `${added.length} contacts added from ${opts.source || "import"} (valid ${counts.valid}, invalid ${counts.invalid}, duplicate ${counts.duplicate}, dnc ${counts.dnc})${mondayCreated ? `, monday ${mondayCreated}` : ""}`,
  );
  return { added: added.length, counts, mondayCreated, checks };
}

/** External source result → import row. */
export function foundToRow(f: Found, source: string): ImportRow {
  const row: ImportRow = {
    Company: f.company, "Contact Name": f.contactName, Title: f.title, Email: f.email, Phone: f.phone, Website: f.website,
    Industry: f.industry, City: f.city, Country: f.country, Source: source,
    Notes: [f.linkedin, f.extra].filter(Boolean).join(" · "),
  };
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v)) as ImportRow;
}

export { IMPORT_FIELDS };
