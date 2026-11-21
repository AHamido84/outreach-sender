// Generic helpers to read tabs as objects (columns found by header name) and write only changed cells.
import type { SheetStore, ValueRange } from "./sheets/types";
import { cellA1 } from "./sheets/types";

export type Row = { _row: number; [header: string]: string | number };
export type Table = { tab: string; headers: string[]; rows: Row[] };

export function get(row: Row | undefined, header: string): string {
  if (!row) return "";
  const v = row[header];
  return v == null ? "" : String(v);
}

export function toTable(tab: string, values: string[][]): Table {
  const headers = (values[0] || []).map((h) => String(h).trim());
  const rows: Row[] = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r || r.every((c) => !String(c ?? "").trim())) continue;
    const o: Row = { _row: i + 1 };
    headers.forEach((h, j) => {
      if (h) o[h] = String(r[j] ?? "");
    });
    rows.push(o);
  }
  return { tab, headers, rows };
}

export async function readTables(store: SheetStore, sheetId: string, tabs: string[]): Promise<Record<string, Table>> {
  const vals = await store.batchGet(sheetId, tabs);
  const out: Record<string, Table> = {};
  tabs.forEach((t, i) => (out[t] = toTable(t, vals[i] || [])));
  return out;
}

/** Collects cell updates and appends, then flushes them in as few API calls as possible. */
export class Writer {
  updates: ValueRange[] = [];
  appends = new Map<string, string[][]>();
  constructor(private store: SheetStore, private sheetId: string) {}

  /** Update only the cells whose value actually changes. Mutates the row object. Returns changed headers. */
  update(table: Table, row: Row, patch: Record<string, string | number | undefined>): string[] {
    const changed: string[] = [];
    for (const [h, raw] of Object.entries(patch)) {
      if (raw === undefined) continue;
      const v = String(raw);
      const col = table.headers.indexOf(h);
      if (col < 0) continue;
      if (get(row, h) === v) continue;
      row[h] = v;
      this.updates.push({ range: cellA1(table.tab, col, row._row), values: [[v]] });
      changed.push(h);
    }
    return changed;
  }

  append(table: Table, obj: Record<string, string | number | undefined>) {
    const arr = table.headers.map((h) => (obj[h] == null ? "" : String(obj[h])));
    const list = this.appends.get(table.tab) || [];
    list.push(arr);
    this.appends.set(table.tab, list);
    // Track the new row locally so later reads in the same request see it.
    const lastRow = Math.max(1, ...table.rows.map((r) => r._row)) + list.length;
    const row: Row = { _row: lastRow };
    table.headers.forEach((h, i) => h && (row[h] = arr[i]));
    table.rows.push(row);
    return row;
  }

  get pending() {
    return this.updates.length + this.appends.size;
  }

  async flush() {
    const updates = this.updates;
    const appends = [...this.appends.entries()];
    this.updates = [];
    this.appends = new Map();
    if (updates.length) await this.store.batchUpdateValues(this.sheetId, updates);
    for (const [tab, rows] of appends) await this.store.append(this.sheetId, tab, rows);
  }
}

// ---- key | value | description tabs ----

export type Kv = {
  table: Table;
  values: Record<string, string>;
  rowOf: Record<string, Row>;
  /** Monday tab only: Field -> column id, from the section below the "Field" header row. */
  mapping: Record<string, string>;
  mappingRowOf: Record<string, Row>;
};

export function toKv(table: Table, mappingFields?: readonly string[]): Kv {
  const kv: Kv = { table, values: {}, rowOf: {}, mapping: {}, mappingRowOf: {} };
  let inMapping = false;
  for (const r of table.rows) {
    const k = get(r, "key").trim();
    if (!k) continue;
    if (k === "Field") {
      inMapping = true;
      continue;
    }
    if (inMapping && (!mappingFields || mappingFields.includes(k))) {
      kv.mapping[k] = get(r, "value").trim();
      kv.mappingRowOf[k] = r;
    } else {
      kv.values[k] = get(r, "value");
      kv.rowOf[k] = r;
    }
  }
  return kv;
}

export function setKv(w: Writer, kv: Kv, key: string, value: string, description = "") {
  const r = kv.rowOf[key];
  kv.values[key] = value;
  if (r) {
    w.update(kv.table, r, { value });
  } else {
    kv.rowOf[key] = w.append(kv.table, { key, value, description });
  }
}
