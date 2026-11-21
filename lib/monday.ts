// Sync a contact to monday.com: create the item if missing (as configured) and update mapped columns.
import { getMonday } from "./adapters";
import type { MondayColumn } from "./adapters/types";
import { secret, type Ctx } from "./company";
import { toErrorInfo } from "./errors";
import { columnValue, FIELD_SOURCE, itemUrl } from "./monday-values";
import { MONDAY_FIELDS, TABS, type MondayField } from "./schema";
import type { Row } from "./table";
import { get } from "./table";

export type MondayOutcome = { ok: boolean; skipped?: boolean; itemId?: string; url?: string; error?: string };

const colCache = new Map<string, { at: number; cols: MondayColumn[] }>();

export function mondayConfig(ctx: Ctx) {
  const v = ctx.monday.values;
  return {
    token: secret(ctx.monday, "API Token"),
    boardId: (v["Board ID"] || "").trim(),
    groupId: (v["Group ID"] || "").trim(),
    createOn: (v["Create Item On"] || "first send").trim().toLowerCase(),
    updateOnReply: !/^(no|false|0|off)$/i.test((v["Update Status On Reply"] || "yes").trim()),
    slug: (v["Account Slug"] || "").trim(),
    mapping: ctx.monday.mapping as Partial<Record<MondayField, string>>,
  };
}

export function mondayConfigured(ctx: Ctx): boolean {
  const c = mondayConfig(ctx);
  return !!(c.token && c.boardId);
}

async function boardColumns(token: string, boardId: string): Promise<MondayColumn[]> {
  const hit = colCache.get(boardId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.cols;
  const b = await getMonday().board(token, boardId);
  colCache.set(boardId, { at: Date.now(), cols: b.columns });
  return b.columns;
}

export function clearMondayCache() {
  colCache.clear();
}

export async function syncContactToMonday(ctx: Ctx, contact: Row, event: "send" | "reply" | "import" | "retry" | "status"): Promise<MondayOutcome> {
  const cfg = mondayConfig(ctx);
  const contacts = ctx.t[TABS.contacts];
  if (!cfg.token || !cfg.boardId) return { ok: true, skipped: true };
  let itemId = get(contact, "monday Item ID");
  // "import" mode normally creates items at import; if one is still missing at send time we create it anyway.
  if (!itemId && (cfg.createOn === "never" || event === "reply" || event === "status")) return { ok: true, skipped: true };
  try {
    const cols = await boardColumns(cfg.token, cfg.boardId);
    const values: Record<string, unknown> = {};
    for (const f of MONDAY_FIELDS) {
      const colId = cfg.mapping[f];
      if (!colId) continue;
      const col = cols.find((c) => c.id === colId);
      if (!col) continue;
      const val = columnValue(col.type, get(contact, FIELD_SOURCE[f]));
      if (val !== null && val !== "") values[colId] = val;
    }
    const api = getMonday();
    if (!itemId) {
      const name = get(contact, "Company") || get(contact, "Contact Name") || get(contact, "Email");
      itemId = (await api.createItem(cfg.token, cfg.boardId, cfg.groupId || null, name, values)).id;
    } else {
      await api.updateItem(cfg.token, cfg.boardId, itemId, values);
    }
    ctx.w.update(contacts, contact, { "monday Item ID": itemId, "monday Status": "Synced" });
    return { ok: true, itemId, url: itemUrl(cfg.slug, cfg.boardId, itemId) };
  } catch (e) {
    const info = toErrorInfo(e);
    const reason = info.detail || info.code;
    ctx.w.update(contacts, contact, { "monday Status": `Failed: ${reason}`.slice(0, 300) });
    return { ok: false, error: reason, itemId: itemId || undefined };
  }
}
