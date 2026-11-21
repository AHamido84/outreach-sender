// "Initialize sheet" / "Repair sheet": create missing tabs, headers and keys without touching existing data.
import { logActivity } from "./company";
import {
  ALL_TABS, KV_HEADERS, KV_TABS, MONDAY_FIELDS, MONDAY_MAP_HEADER, TABLE_TABS, TABS,
} from "./schema";
import { getStore } from "./sheets";
import type { ValueRange } from "./sheets/types";
import { cellA1, quoteTab } from "./sheets/types";
import { get, readTables, toKv, Writer } from "./table";

export type InitReport = { createdTabs: string[]; addedHeaders: string[]; addedKeys: string[]; title: string };

const SAMPLE_TEMPLATES = [
  {
    "Template ID": "T1", Name: "أول رسالة", Language: "AR", Step: "0", "Delay Days": "0", Version: "A", Active: "no",
    Subject: "{first_name}، فكرة سريعة لـ {company}",
    Body: "أهلاً {first_name}،\n\nأنا {sender_name} من {our_company}. لاحظت أن {company} تعمل في مجال {industry} في {city}، وعندنا حل يساعد شركات مشابهة.\n\nهل يناسبك اتصال قصير هذا الأسبوع؟ {booking_link}\n\n{signature}\n\n{unsubscribe}",
  },
  {
    "Template ID": "T2", Name: "متابعة 1", Language: "AR", Step: "1", "Delay Days": "3", Version: "A", Active: "no",
    Subject: "", Body: "أهلاً {first_name}،\n\nأتابع رسالتي السابقة — هل الفكرة مناسبة لـ {company}؟\n\n{signature}\n\n{unsubscribe}",
  },
  {
    "Template ID": "T3", Name: "First email", Language: "EN", Step: "0", "Delay Days": "0", Version: "A", Active: "no",
    Subject: "Quick idea for {company}",
    Body: "Hi {first_name},\n\nI'm {sender_name} from {our_company}. We help {industry} companies in {city} grow.\n\nOpen to a short call? {booking_link}\n\n{signature}\n\n{unsubscribe}",
  },
];

export async function initializeSheet(sheetId: string, opts: { log?: boolean } = {}): Promise<InitReport> {
  const store = getStore();
  const meta = await store.getMeta(sheetId);
  const report: InitReport = { createdTabs: [], addedHeaders: [], addedKeys: [], title: meta.title };
  const have = new Map(meta.tabs.map((t) => [t.title, t]));

  // 1) Tabs (RTL, frozen header row)
  const structural: object[] = [];
  for (const title of ALL_TABS) {
    const t = have.get(title);
    if (!t) {
      structural.push({ addSheet: { properties: { title, rightToLeft: true, gridProperties: { frozenRowCount: 1 } } } });
      report.createdTabs.push(title);
    } else if (!t.rightToLeft || !t.frozenRows) {
      structural.push({
        updateSheetProperties: {
          properties: { sheetId: t.sheetId, rightToLeft: true, gridProperties: { frozenRowCount: Math.max(1, t.frozenRows || 0) } },
          fields: "rightToLeft,gridProperties.frozenRowCount",
        },
      });
    }
  }
  if (structural.length) await store.batchUpdate(sheetId, structural);

  // 2) Headers
  const tables = await readTables(store, sheetId, ALL_TABS);
  const headerWrites: ValueRange[] = [];
  const ensureHeaders = (tab: string, wanted: string[]) => {
    const t = tables[tab];
    if (!t.headers.filter(Boolean).length) {
      headerWrites.push({ range: `${quoteTab(tab)}!A1`, values: [wanted] });
      t.headers = [...wanted];
      return;
    }
    const missing = wanted.filter((h) => !t.headers.includes(h));
    missing.forEach((h) => {
      headerWrites.push({ range: cellA1(tab, t.headers.length, 1), values: [[h]] });
      t.headers.push(h);
      report.addedHeaders.push(`${tab}: ${h}`);
    });
  };
  for (const { tab, headers } of TABLE_TABS) ensureHeaders(tab, headers);
  for (const { tab } of KV_TABS) ensureHeaders(tab, KV_HEADERS);
  if (headerWrites.length) await store.batchUpdateValues(sheetId, headerWrites);

  // 3) Key/value rows
  const w = new Writer(store, sheetId);
  for (const { tab, keys } of KV_TABS) {
    const table = tables[tab];
    const kv = toKv(table, tab === TABS.monday ? MONDAY_FIELDS : undefined);
    for (const k of keys) {
      if (!(k.key in kv.values)) {
        w.append(table, { key: k.key, value: k.default ?? "", description: k.description });
        report.addedKeys.push(`${tab}: ${k.key}`);
      }
    }
    if (tab === TABS.monday) {
      const hasSection = table.rows.some((r) => get(r, "key") === "Field");
      if (!hasSection) {
        w.append(table, { key: MONDAY_MAP_HEADER[0], value: MONDAY_MAP_HEADER[1], description: "ربط الحقول بأعمدة monday" });
      }
      for (const f of MONDAY_FIELDS) {
        if (!(f in kv.mapping)) {
          w.append(table, { key: f, value: "", description: "" });
          report.addedKeys.push(`${tab}: ${f}`);
        }
      }
    }
  }

  // 4) Sample templates (inactive) for a brand-new sheet
  if (!tables[TABS.templates].rows.length) {
    for (const t of SAMPLE_TEMPLATES) w.append(tables[TABS.templates], t);
  }
  await w.flush();

  // 5) Bold header row on every tab
  const meta2 = await store.getMeta(sheetId);
  const bold = meta2.tabs
    .filter((t) => (ALL_TABS as string[]).includes(t.title))
    .map((t) => ({
      repeatCell: {
        range: { sheetId: t.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.95, blue: 0.98 } } },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    }));
  // Mapping header row on the Monday tab in bold too
  const mondayTab = meta2.tabs.find((t) => t.title === TABS.monday);
  const mon = await readTables(store, sheetId, [TABS.monday]);
  const fieldRow = mon[TABS.monday].rows.find((r) => get(r, "key") === "Field");
  if (mondayTab && fieldRow) {
    bold.push({
      repeatCell: {
        range: { sheetId: mondayTab.sheetId, startRowIndex: fieldRow._row - 1, endRowIndex: fieldRow._row },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.95, blue: 0.98 } } },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    });
  }
  if (bold.length) await store.batchUpdate(sheetId, bold);

  if (opts.log !== false) {
    await logActivity(
      { sheetId },
      "Initialize sheet",
      `tabs: ${report.createdTabs.join(", ") || "—"} | headers: ${report.addedHeaders.length} | keys: ${report.addedKeys.length}`,
    );
  }
  return report;
}
