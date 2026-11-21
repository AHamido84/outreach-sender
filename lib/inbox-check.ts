// IMAP check: replies stop the sequence, bounces & unsubscribes go to Do Not Contact.
import { getInbox } from "./adapters";
import { loadCompany, logActivity, senderSettings, type Ctx } from "./company";
import { classifyInbound } from "./detect";
import { bounceGuard } from "./engine";
import { mondayConfig, syncContactToMonday } from "./monday";
import { TABS } from "./schema";
import { get, setKv } from "./table";

export type InboxResult = { checked: number; replies: number; bounces: number; unsubscribes: number; skipped?: string };

function addDnc(ctx: Ctx, value: string, reason: string) {
  const t = ctx.t[TABS.dnc];
  const v = value.toLowerCase().trim();
  if (!v || t.rows.some((r) => get(r, "Email or Domain").toLowerCase().trim() === v)) return;
  ctx.w.append(t, { "Email or Domain": v, Reason: reason, "Added At": new Date().toISOString() });
}

export async function checkInbox(companyId: string, limit = 40): Promise<InboxResult> {
  const ctx = await loadCompany(companyId);
  return checkInboxWith(ctx, limit);
}

export async function checkInboxWith(ctx: Ctx, limit = 40): Promise<InboxResult> {
  const s = senderSettings(ctx);
  const res: InboxResult = { checked: 0, replies: 0, bounces: 0, unsubscribes: 0 };
  if (!s.imap.host || !s.imap.user || !s.imap.pass) return { ...res, skipped: "imap_not_configured" };
  const sinceRaw = ctx.sender.values["IMAP Last UID"];
  const since = sinceRaw && /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : null;
  const { messages, lastUid } = await getInbox().fetchNew(s.imap, since, limit);
  const contacts = ctx.t[TABS.contacts];
  const now = new Date().toISOString();
  const mcfg = mondayConfig(ctx);
  for (const m of messages) {
    res.checked++;
    const c = classifyInbound(m, contacts.rows);
    if (!c.contact) {
      if (c.kind === "bounce") for (const e of c.bouncedEmails || []) addDnc(ctx, e, "Bounce");
      continue;
    }
    const status = get(c.contact, "Status");
    const email = get(c.contact, "Email");
    if (c.kind === "bounce") {
      if (status === "Unsubscribed") continue;
      ctx.w.update(contacts, c.contact, { Status: "Bounced", "Next Send At": "", Error: `Bounce: ${m.subject}`.slice(0, 200) });
      addDnc(ctx, email, "Bounce");
      res.bounces++;
    } else if (c.kind === "unsubscribe") {
      ctx.w.update(contacts, c.contact, { Status: "Unsubscribed", "Next Send At": "" });
      addDnc(ctx, email, "Unsubscribe reply");
      res.unsubscribes++;
    } else if (c.kind === "reply") {
      if (["Bounced", "Unsubscribed", "Replied"].includes(status)) continue;
      ctx.w.update(contacts, c.contact, { Status: "Replied", "Next Send At": "" });
      res.replies++;
    } else continue;
    if (mcfg.updateOnReply) await syncContactToMonday(ctx, c.contact, "status").catch(() => {});
  }
  if (lastUid != null) setKv(ctx.w, ctx.sender, "IMAP Last UID", String(lastUid));
  setKv(ctx.w, ctx.sender, "IMAP Checked At", now);
  await ctx.w.flush();
  if (res.replies || res.bounces || res.unsubscribes) {
    await logActivity(ctx, "Inbox check", `replies ${res.replies}, bounces ${res.bounces}, unsubscribes ${res.unsubscribes}`);
    await bounceGuard(ctx);
  }
  return res;
}
