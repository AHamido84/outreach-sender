// Registry + per-company context loading. A company's id is its spreadsheet ID.
import type { ImapConfig, SmtpConfig } from "./adapters/types";
import { decrypt, encrypt, isEncrypted } from "./crypto";
import { registrySheetId } from "./env";
import { AppError, isAppError } from "./errors";
import { MONDAY_FIELDS, REGISTRY_HEADERS, REGISTRY_TABS, SECRET_KEYS, TABS } from "./schema";
import { isYes, toTemplate, type Template } from "./selection";
import { getStore } from "./sheets";
import { parseSheetId } from "./sheets/types";
import { appendObjects, get, readTables, setKv, toKv, Writer, type Kv, type Table } from "./table";
import { parseDays, safeTz, type SendWindow } from "./time";

export type CompanyRef = { id: string; name: string; url: string; color: string; active: boolean; _row: number };

// ---------- Registry ----------

let ensuring: Promise<void> | null = null;

/** Create the registry tabs if missing. Serialized per instance; tolerant of another instance doing it at the same time. */
function ensureRegistry(): Promise<void> {
  if (!ensuring) ensuring = doEnsureRegistry().finally(() => (ensuring = null));
  return ensuring;
}

async function doEnsureRegistry(): Promise<void> {
  const store = getStore();
  const sid = registrySheetId();
  if (!sid) throw new AppError("registry_missing");
  for (let attempt = 0; attempt < 2; attempt++) {
    store.invalidate(sid);
    const meta = await store.getMeta(sid);
    const have = new Set(meta.tabs.map((t) => t.title));
    const add = [REGISTRY_TABS.companies, REGISTRY_TABS.system].filter((t) => !have.has(t));
    if (!add.length) break;
    try {
      await store.batchUpdate(
        sid,
        add.map((title) => ({ addSheet: { properties: { title, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } })),
      );
    } catch (e) {
      if (attempt === 0 && isAppError(e) && /already exists/i.test(e.detail || "")) continue; // created concurrently
      throw e;
    }
  }
  // Headers (only where the header row is empty)
  const t = await readTables(store, sid, [REGISTRY_TABS.companies, REGISTRY_TABS.system]);
  const data = [];
  if (!t[REGISTRY_TABS.companies].headers.filter(Boolean).length) data.push({ range: `'${REGISTRY_TABS.companies}'!A1`, values: [REGISTRY_HEADERS] });
  if (!t[REGISTRY_TABS.system].headers.filter(Boolean).length) data.push({ range: `'${REGISTRY_TABS.system}'!A1`, values: [["key", "value"]] });
  if (data.length) await store.batchUpdateValues(sid, data);
}

export async function readRegistry(): Promise<{ companies: Table; system: Kv }> {
  const sid = registrySheetId();
  let t: Record<string, Table>;
  try {
    t = await readTables(getStore(), sid, [REGISTRY_TABS.companies, REGISTRY_TABS.system]);
  } catch (e) {
    if (isAppError(e, "sheets_api") && /parse range/i.test(e.detail || "")) {
      await ensureRegistry();
      t = await readTables(getStore(), sid, [REGISTRY_TABS.companies, REGISTRY_TABS.system]);
    } else throw e;
  }
  return { companies: t[REGISTRY_TABS.companies], system: toKv(t[REGISTRY_TABS.system]) };
}

export async function listCompanies(): Promise<CompanyRef[]> {
  const { companies } = await readRegistry();
  return companies.rows
    .map((r) => {
      const url = get(r, "Sheet URL");
      const id = parseSheetId(url) || "";
      return { id, name: get(r, "Name"), url, color: get(r, "Color") || "#2563eb", active: get(r, "Active") ? isYes(get(r, "Active")) : true, _row: r._row };
    })
    .filter((c) => c.id);
}

export async function getCompanyRef(id: string): Promise<CompanyRef> {
  const c = (await listCompanies()).find((x) => x.id === id);
  if (!c) throw new AppError("company_not_found", id);
  return c;
}

export async function setSystemValue(key: string, value: string) {
  const { system } = await readRegistry();
  const w = new Writer(getStore(), registrySheetId());
  setKv(w, system, key, value);
  await w.flush();
}

// ---------- Company context ----------

export type Ctx = {
  ref: CompanyRef;
  sheetId: string;
  t: Record<string, Table>;
  company: Kv;
  sender: Kv;
  monday: Kv;
  /** Only when loaded with TABS.sources (see loadWithSources). */
  sources?: Kv;
  templates: Template[];
  w: Writer;
};

const DEFAULT_TABS = [TABS.company, TABS.sender, TABS.monday, TABS.templates, TABS.contacts, TABS.dnc] as const;

export async function loadCompany(id: string, extraTabs: string[] = []): Promise<Ctx> {
  const ref = await getCompanyRef(id);
  const store = getStore();
  const tabs = [...new Set([...DEFAULT_TABS, ...extraTabs])];
  let t: Record<string, Table>;
  try {
    t = await readTables(store, id, tabs);
  } catch (e) {
    if (isAppError(e, "sheets_api") && /parse range/i.test(e.detail || "")) throw new AppError("sheet_not_initialized", e.detail);
    throw e;
  }
  const ctx: Ctx = {
    ref,
    sheetId: id,
    t,
    company: toKv(t[TABS.company]),
    sender: toKv(t[TABS.sender]),
    monday: toKv(t[TABS.monday], MONDAY_FIELDS),
    sources: t[TABS.sources] ? toKv(t[TABS.sources]) : undefined,
    templates: t[TABS.templates].rows.map(toTemplate).filter((x) => x.id || x.subject || x.body),
    w: new Writer(store, id),
  };
  // Plain secrets typed directly into the sheet are accepted and re-saved encrypted.
  const secretTabs: [string, Kv][] = [[TABS.sender, ctx.sender], [TABS.monday, ctx.monday]];
  if (ctx.sources) secretTabs.push([TABS.sources, ctx.sources]);
  for (const [tab, kv] of secretTabs) {
    for (const key of SECRET_KEYS[tab]) {
      const v = kv.values[key];
      if (v && !isEncrypted(v)) setKv(ctx.w, kv, key, encrypt(v));
    }
  }
  if (ctx.w.pending) await ctx.w.flush().catch(() => {});
  return ctx;
}

export function secret(kv: Kv, key: string): string {
  const v = kv.values[key];
  if (!v) return "";
  try {
    return decrypt(v);
  } catch {
    throw new AppError("secret_decrypt", key);
  }
}

export function num(v: string | undefined, def: number): number {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : def;
}

export type SenderSettings = {
  smtp: SmtpConfig;
  imap: ImapConfig;
  dailyLimit: number;
  perRun: number;
  delaySec: number;
  window: SendWindow;
  tz: string;
  auto: boolean;
  maxBounce: number;
  smtpTestedAt: string;
  allowSameDomain: boolean;
  allowResend: boolean;
};

export function senderSettings(ctx: Ctx): SenderSettings {
  const v = ctx.sender.values;
  const smtpPass = secret(ctx.sender, "SMTP Password");
  const tz = safeTz(v["Timezone"]);
  const port = num(v["SMTP Port"], 465);
  return {
    smtp: {
      host: (v["SMTP Host"] || "").trim(),
      port,
      secure: v["SMTP Secure"] ? isYes(v["SMTP Secure"]) : port === 465,
      user: (v["SMTP User"] || "").trim(),
      pass: smtpPass,
      fromName: v["From Name"] || "",
      fromEmail: (v["From Email"] || v["SMTP User"] || "").trim(),
      replyTo: (v["Reply-To"] || "").trim() || undefined,
    },
    imap: {
      host: (v["IMAP Host"] || "").trim(),
      port: num(v["IMAP Port"], 993),
      user: (v["IMAP User"] || v["SMTP User"] || "").trim(),
      pass: secret(ctx.sender, "IMAP Password") || smtpPass,
    },
    dailyLimit: Math.max(0, num(v["Daily Limit"], 30)),
    perRun: Math.max(1, num(v["Emails Per Run"], 5)),
    delaySec: Math.max(0, num(v["Delay Between Emails"], 20)),
    window: { days: parseDays(v["Send Days"] || "Sun,Mon,Tue,Wed,Thu"), start: num(v["Send Start Hour"], 9), end: num(v["Send End Hour"], 17), tz },
    tz,
    auto: isYes(v["Auto Sending"]),
    maxBounce: num(v["Max Bounce Rate"], 5),
    allowSameDomain: isYes(v["Allow Same Domain"]),
    allowResend: isYes(v["Allow Resend"]),
    smtpTestedAt: v["SMTP Tested At"] || "",
  };
}

export async function logActivity(ctx: Pick<Ctx, "sheetId">, action: string, details: string) {
  await appendObjects(getStore(), ctx.sheetId, TABS.activity, [
    { Time: new Date().toISOString(), Action: action, Details: details.slice(0, 5000) },
  ]).catch(() => {});
}

/** Load a company including the Sources tab; older sheets get the tab created on first use (same as "Repair sheet"). */
export async function loadWithSources(id: string, extraTabs: string[] = []): Promise<Ctx & { sources: Kv }> {
  try {
    const ctx = await loadCompany(id, [TABS.sources, ...extraTabs]);
    return ctx as Ctx & { sources: Kv };
  } catch (e) {
    if (!isAppError(e, "sheet_not_initialized")) throw e;
    const { initializeSheet } = await import("./init");
    await initializeSheet(id);
    return (await loadCompany(id, [TABS.sources, ...extraTabs])) as Ctx & { sources: Kv };
  }
}
