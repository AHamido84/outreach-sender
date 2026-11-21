// Store factory with a ~20s read cache (per server instance). Any write invalidates that spreadsheet's cache.
import { isDemo } from "../env";
import { GoogleSheetStore } from "./google";
import type { SheetMeta, SheetStore, ValueRange } from "./types";

const TTL_MS = 20_000;

class CachedStore implements SheetStore {
  private cache = new Map<string, { at: number; value: Promise<unknown> }>();
  constructor(private inner: SheetStore) {}

  serviceAccountEmail() {
    return this.inner.serviceAccountEmail();
  }

  private cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as Promise<T>;
    const value = fn();
    this.cache.set(key, { at: Date.now(), value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  invalidate(sheetId: string) {
    for (const k of this.cache.keys()) if (k.startsWith(sheetId + "|")) this.cache.delete(k);
  }

  getMeta(sheetId: string): Promise<SheetMeta> {
    return this.cached(`${sheetId}|meta`, () => this.inner.getMeta(sheetId));
  }

  async batchGet(sheetId: string, ranges: string[]): Promise<string[][][]> {
    const missing = ranges.filter((r) => {
      const h = this.cache.get(`${sheetId}|r|${r}`);
      return !h || Date.now() - h.at >= TTL_MS;
    });
    if (missing.length) {
      const all = this.inner.batchGet(sheetId, missing);
      missing.forEach((r, i) => {
        const p = all.then((x) => x[i]);
        p.catch(() => this.cache.delete(`${sheetId}|r|${r}`));
        this.cache.set(`${sheetId}|r|${r}`, { at: Date.now(), value: p });
      });
    }
    const vals = await Promise.all(ranges.map((r) => this.cache.get(`${sheetId}|r|${r}`)!.value as Promise<string[][]>));
    return vals.map((rows) => rows.map((r) => [...r]));
  }

  async batchUpdateValues(sheetId: string, data: ValueRange[]) {
    this.invalidate(sheetId);
    await this.inner.batchUpdateValues(sheetId, data);
    this.invalidate(sheetId);
  }

  async append(sheetId: string, tab: string, rows: string[][]) {
    this.invalidate(sheetId);
    await this.inner.append(sheetId, tab, rows);
    this.invalidate(sheetId);
  }

  async batchUpdate(sheetId: string, requests: object[]) {
    this.invalidate(sheetId);
    await this.inner.batchUpdate(sheetId, requests);
    this.invalidate(sheetId);
  }
}

const g = globalThis as unknown as { __sheetStore?: CachedStore };

export function getStore(): CachedStore {
  if (!g.__sheetStore) {
    if (isDemo()) {
      // Lazy import keeps demo seed data out of the real code path.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDemoStore } = require("../demo/seed") as typeof import("../demo/seed");
      g.__sheetStore = new CachedStore(getDemoStore());
    } else {
      g.__sheetStore = new CachedStore(new GoogleSheetStore());
    }
  }
  return g.__sheetStore;
}

/** For tests: use a specific store. */
export function setStore(store: SheetStore) {
  g.__sheetStore = new CachedStore(store);
}

export type { SheetStore };
