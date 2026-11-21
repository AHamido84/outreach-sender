export type TabMeta = { title: string; sheetId: number; rightToLeft?: boolean; frozenRows?: number };
export type SheetMeta = { title: string; tabs: TabMeta[] };
export type ValueRange = { range: string; values: string[][] };

/** Minimal Google Sheets surface the app needs. Implemented by the real API and by an in-memory fake (demo). */
export interface SheetStore {
  serviceAccountEmail(): string;
  getMeta(sheetId: string): Promise<SheetMeta>;
  /** Each range is a tab name (whole tab) or an A1 range. Returns rows of strings, trailing empties trimmed. */
  batchGet(sheetId: string, ranges: string[]): Promise<string[][][]>;
  batchUpdateValues(sheetId: string, data: ValueRange[]): Promise<void>;
  append(sheetId: string, tab: string, rows: string[][]): Promise<void>;
  /** Structural requests (addSheet, updateSheetProperties, repeatCell, deleteDimension). */
  batchUpdate(sheetId: string, requests: object[]): Promise<void>;
}

export function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

export function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** A1 address of one cell, 0-based column and 1-based row. */
export function cellA1(tab: string, col: number, row: number): string {
  return `${quoteTab(tab)}!${colLetter(col)}${row}`;
}

/** Extract the spreadsheet ID from a Google Sheets URL (or accept a bare ID). */
export function parseSheetId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{10,})/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
  return null;
}
