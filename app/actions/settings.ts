"use server";
import { revalidatePath } from "next/cache";
import { getInbox, getMailer, getMonday } from "@/lib/adapters";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { loadCompany, logActivity, secret, senderSettings } from "@/lib/company";
import { encrypt } from "@/lib/crypto";
import { checkDomain } from "@/lib/dns-check";
import { domainOf, websiteDomain } from "@/lib/emails";
import { autoBlockers } from "@/lib/engine";
import { AppError } from "@/lib/errors";
import { clearMondayCache, mondayConfig } from "@/lib/monday";
import { FIELD_COLUMN_TYPES, itemUrl } from "@/lib/monday-values";
import { COMPANY_KEYS, MONDAY_FIELDS, MONDAY_KEYS, SENDER_KEYS, TABS, type KvDef, type MondayField } from "@/lib/schema";
import { getStore } from "@/lib/sheets";
import { get, setKv } from "@/lib/table";

const DEFS: Record<string, KvDef[]> = { [TABS.company]: COMPANY_KEYS, [TABS.sender]: SENDER_KEYS, [TABS.monday]: MONDAY_KEYS };
const SMTP_KEYS = ["SMTP Host", "SMTP Port", "SMTP Secure", "SMTP User", "SMTP Password", "From Email"];

/** Save key/value settings. Secrets: empty = keep, value = encrypt. Only changed cells are written. */
export async function saveSettings(id: string, tab: string, values: Record<string, string>) {
  return act(async () => {
    await requireSession();
    const defs = DEFS[tab];
    if (!defs) throw new AppError("invalid_input");
    const ctx = await loadCompany(id);
    const kv = tab === TABS.company ? ctx.company : tab === TABS.sender ? ctx.sender : ctx.monday;
    const changed: string[] = [];
    for (const d of defs) {
      if (d.system || !(d.key in values)) continue;
      let v = String(values[d.key] ?? "");
      if (d.secret) {
        if (!v.trim()) continue;
        v = encrypt(v.trim());
      } else if (v === (kv.values[d.key] ?? "")) continue;
      if (d.key === "Auto Sending" && /^on$/i.test(v)) {
        const blockers = autoBlockers(ctx);
        if (blockers.length) throw new AppError("auto_blocked", blockers.join(", "));
        setKv(ctx.w, kv, "Auto Off Reason", "");
      }
      setKv(ctx.w, kv, d.key, v, d.description);
      changed.push(d.key);
    }
    if (tab === TABS.sender && changed.some((k) => SMTP_KEYS.includes(k))) setKv(ctx.w, kv, "SMTP Tested At", "");
    if (tab === TABS.monday && changed.length) clearMondayCache();
    await ctx.w.flush();
    if (changed.length) await logActivity(ctx, `Settings changed: ${tab}`, changed.join(", "));
    revalidatePath(`/c/${id}`, "layout");
    return { changed };
  });
}

export async function setAutoSending(id: string, on: boolean) {
  return saveSettings(id, TABS.sender, { "Auto Sending": on ? "on" : "off" });
}

export async function testSmtp(id: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const s = senderSettings(ctx);
    await getMailer().verify(s.smtp);
    setKv(ctx.w, ctx.sender, "SMTP Tested At", new Date().toISOString());
    setKv(ctx.w, ctx.sender, "Auth Failures In A Row", "0");
    await ctx.w.flush();
    await logActivity(ctx, "Test SMTP", `ok ${s.smtp.host}:${s.smtp.port}`);
    revalidatePath(`/c/${id}`, "layout");
    return true;
  });
}

export async function testImap(id: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const s = senderSettings(ctx);
    await getInbox().verify(s.imap);
    setKv(ctx.w, ctx.sender, "IMAP Tested At", new Date().toISOString());
    await ctx.w.flush();
    await logActivity(ctx, "Test IMAP", `ok ${s.imap.host}:${s.imap.port}`);
    return true;
  });
}

export async function sendTestEmail(id: string, to?: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const s = senderSettings(ctx);
    const target = (to || s.smtp.replyTo || s.smtp.fromEmail).trim();
    const html = `<div dir="rtl" style="font-family:Tahoma,Arial">هذه رسالة تجربة من Outreach Sender ✓<br>الإعدادات تعمل بشكل صحيح.</div>`;
    await getMailer().send(s.smtp, {
      to: target, subject: "تجربة إرسال — Outreach Sender", text: "هذه رسالة تجربة من Outreach Sender ✓", html,
      messageId: `<test.${Date.now()}@${domainOf(s.smtp.fromEmail) || "outreach.local"}>`,
    });
    await logActivity(ctx, "Test email", `sent to ${target}`);
    return { to: target };
  });
}

export async function deliverabilityCheck(id: string, selector: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const s = senderSettings(ctx);
    const domain = domainOf(s.smtp.fromEmail) || websiteDomain(ctx.company.values["Website"]);
    if (!domain) throw new AppError("invalid_input", "From Email is empty");
    return { domain, items: await checkDomain(domain, selector || "google") };
  });
}

// ---------- monday ----------

export async function loadMondayBoard(id: string, input: { token?: string; board: string }) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const boardId = (input.board.match(/boards\/(\d+)/)?.[1] || input.board).trim();
    if (!/^\d+$/.test(boardId)) throw new AppError("invalid_input", "Board ID");
    const token = input.token?.trim() || secret(ctx.monday, "API Token");
    const api = getMonday();
    const [me, board] = await Promise.all([api.me(token), api.board(token, boardId)]);
    if (input.token?.trim()) setKv(ctx.w, ctx.monday, "API Token", encrypt(input.token.trim()));
    setKv(ctx.w, ctx.monday, "Board ID", boardId);
    setKv(ctx.w, ctx.monday, "Account Slug", me.accountSlug);
    await ctx.w.flush();
    clearMondayCache();
    revalidatePath(`/c/${id}/settings`);
    return { board, me, mapping: ctx.monday.mapping };
  });
}

export async function saveMondayMapping(id: string, input: { groupId: string; createOn: string; updateOnReply: boolean; mapping: Record<string, string> }) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    setKv(ctx.w, ctx.monday, "Group ID", input.groupId || "");
    setKv(ctx.w, ctx.monday, "Create Item On", input.createOn || "first send");
    setKv(ctx.w, ctx.monday, "Update Status On Reply", input.updateOnReply ? "yes" : "no");
    const t = ctx.t[TABS.monday];
    for (const f of MONDAY_FIELDS) {
      const v = input.mapping[f] ?? "";
      const row = ctx.monday.mappingRowOf[f];
      if (row) ctx.w.update(t, row, { value: v });
      else ctx.w.append(t, { key: f, value: v, description: "" });
    }
    await ctx.w.flush();
    clearMondayCache();
    await logActivity(ctx, "Settings changed: Monday", "mapping");
    revalidatePath(`/c/${id}/settings`);
    return true;
  });
}

export async function createMissingMondayColumns(id: string, fields: string[]) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const cfg = mondayConfig(ctx);
    if (!cfg.token || !cfg.boardId) throw new AppError("monday_no_token");
    const created: Record<string, string> = {};
    for (const f of fields as MondayField[]) {
      const def = FIELD_COLUMN_TYPES[f];
      if (!def || cfg.mapping[f]) continue;
      const col = await getMonday().createColumn(cfg.token, cfg.boardId, def.title, def.type);
      created[f] = col.id;
      const row = ctx.monday.mappingRowOf[f];
      if (row) ctx.w.update(ctx.t[TABS.monday], row, { value: col.id });
      else ctx.w.append(ctx.t[TABS.monday], { key: f, value: col.id, description: "" });
    }
    await ctx.w.flush();
    clearMondayCache();
    await logActivity(ctx, "monday columns created", Object.keys(created).join(", "));
    revalidatePath(`/c/${id}/settings`);
    return { created, board: await getMonday().board(cfg.token, cfg.boardId) };
  });
}

export async function testMonday(id: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const cfg = mondayConfig(ctx);
    if (!cfg.token || !cfg.boardId) throw new AppError("monday_no_token");
    const api = getMonday();
    const item = await api.createItem(cfg.token, cfg.boardId, cfg.groupId || null, "Outreach Sender — test item", {});
    await api.deleteItem(cfg.token, item.id);
    await logActivity(ctx, "Test monday", `created & deleted item ${item.id}`);
    return { itemId: item.id, url: itemUrl(cfg.slug, cfg.boardId, item.id) };
  });
}

// ---------- Do Not Contact ----------

export async function addDnc(id: string, value: string, reason: string) {
  return act(async () => {
    await requireSession();
    const v = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!v) throw new AppError("invalid_input");
    const ctx = await loadCompany(id);
    const t = ctx.t[TABS.dnc];
    if (!t.rows.some((r) => get(r, "Email or Domain").toLowerCase() === v)) {
      ctx.w.append(t, { "Email or Domain": v, Reason: reason || "Manual", "Added At": new Date().toISOString() });
      await ctx.w.flush();
      await logActivity(ctx, "Do Not Contact added", v);
    }
    revalidatePath(`/c/${id}/settings`);
    return true;
  });
}

export async function removeDnc(id: string, value: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const t = ctx.t[TABS.dnc];
    const row = t.rows.find((r) => get(r, "Email or Domain").toLowerCase() === value.toLowerCase());
    if (!row) return true;
    const meta = await getStore().getMeta(id);
    const tab = meta.tabs.find((x) => x.title === TABS.dnc)!;
    await getStore().batchUpdate(id, [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: row._row - 1, endIndex: row._row } } }]);
    await logActivity(ctx, "Do Not Contact removed", value);
    revalidatePath(`/c/${id}/settings`);
    return true;
  });
}
