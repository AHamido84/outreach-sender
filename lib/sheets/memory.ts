// In-memory fake of the Sheets API for demo mode and tests.
import { AppError } from "../errors";
import type { SheetMeta, SheetStore, ValueRange } from "./types";
import { colIndex } from "./types";

type Tab = { sheetId: number; title: string; rows: string[][]; rightToLeft?: boolean; frozenRows?: number };
type Book = { title: string; tabs: Tab[] };

export function parseA1(range: string): { tab: string; col: number; row: number } {
  const m = range.match(/^(?:'((?:[^']|'')+)'|([^!]+))(?:!([A-Z]+)(\d+)(?::[A-Z]+\d*)?)?$/);
  if (!m) throw new Error("Bad A1 range: " + range);
  const tab = (m[1] ?? m[2]).replace(/''/g, "'");
  return { tab, col: m[3] ? colIndex(m[3]) : 0, row: m[4] ? Number(m[4]) : 1 };
}

function trimRow(r: string[]): string[] {
  const out = [...r];
  while (out.length && (out[out.length - 1] === "" || out[out.length - 1] == null)) out.pop();
  return out;
}

export class MemorySheetStore implements SheetStore {
  books = new Map<string, Book>();
  private nextId = 1;
  /** Sheet IDs the fake service account cannot open (to demo the "share" step). */
  denied = new Set<string>();

  serviceAccountEmail() {
    return "outreach-demo@demo-project.iam.gserviceaccount.com";
  }

  createBook(sheetId: string, title: string) {
    this.books.set(sheetId, { title, tabs: [] });
  }

  private book(sheetId: string): Book {
    if (this.denied.has(sheetId)) throw new AppError("sheet_no_access", "The caller does not have permission (demo)");
    const b = this.books.get(sheetId);
    if (!b) throw new AppError("sheet_not_found", "Requested entity was not found (demo)");
    return b;
  }

  private tab(b: Book, title: string): Tab {
    const t = b.tabs.find((x) => x.title === title);
    if (!t) throw new AppError("sheets_api", `Unable to parse range: ${title}`);
    return t;
  }

  async getMeta(sheetId: string): Promise<SheetMeta> {
    const b = this.book(sheetId);
    return {
      title: b.title,
      tabs: b.tabs.map((t) => ({ title: t.title, sheetId: t.sheetId, rightToLeft: t.rightToLeft, frozenRows: t.frozenRows })),
    };
  }

  async batchGet(sheetId: string, ranges: string[]): Promise<string[][][]> {
    const b = this.book(sheetId);
    return ranges.map((r) => {
      const { tab, row } = parseA1(r);
      const t = this.tab(b, tab);
      const single = /![A-Z]+\d+:[A-Z]+\d+$/.test(r) && r.match(/(\d+):[A-Z]+(\d+)$/);
      const rows = t.rows.map((x) => trimRow(x.map((c) => c ?? "")));
      if (single) return rows.slice(row - 1, Number(single[2]));
      const out = rows;
      while (out.length && out[out.length - 1].length === 0) out.pop();
      return out.map((x) => [...x]);
    });
  }

  async batchUpdateValues(sheetId: string, data: ValueRange[]): Promise<void> {
    const b = this.book(sheetId);
    for (const d of data) {
      const { tab, col, row } = parseA1(d.range);
      const t = this.tab(b, tab);
      d.values.forEach((vals, i) => {
        const r = row - 1 + i;
        while (t.rows.length <= r) t.rows.push([]);
        vals.forEach((v, j) => {
          const c = col + j;
          while (t.rows[r].length <= c) t.rows[r].push("");
          t.rows[r][c] = String(v ?? "");
        });
      });
    }
  }

  async append(sheetId: string, tab: string, rows: string[][]): Promise<void> {
    const t = this.tab(this.book(sheetId), tab);
    let last = t.rows.length;
    while (last > 0 && trimRow(t.rows[last - 1]).length === 0) last--;
    t.rows.length = last;
    for (const r of rows) t.rows.push(r.map((v) => String(v ?? "")));
  }

  async batchUpdate(sheetId: string, requests: object[]): Promise<void> {
    const b = this.book(sheetId);
    for (const req of requests as Record<string, any>[]) {
      if (req.addSheet) {
        const p = req.addSheet.properties || {};
        b.tabs.push({
          sheetId: this.nextId++,
          title: p.title,
          rows: [],
          rightToLeft: p.rightToLeft,
          frozenRows: p.gridProperties?.frozenRowCount,
        });
      } else if (req.updateSheetProperties) {
        const p = req.updateSheetProperties.properties;
        const t = b.tabs.find((x) => x.sheetId === p.sheetId);
        if (t) {
          if (p.rightToLeft !== undefined) t.rightToLeft = p.rightToLeft;
          if (p.gridProperties?.frozenRowCount !== undefined) t.frozenRows = p.gridProperties.frozenRowCount;
        }
      } else if (req.deleteDimension) {
        const r = req.deleteDimension.range;
        const t = b.tabs.find((x) => x.sheetId === r.sheetId);
        if (t && r.dimension === "ROWS") t.rows.splice(r.startIndex, r.endIndex - r.startIndex);
      }
      // repeatCell (formatting) is a no-op in memory
    }
  }
}
