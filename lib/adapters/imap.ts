// Real IMAP via imapflow; messages parsed with mailparser.
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { InboundMessage } from "../detect";
import { AppError } from "../errors";
import type { ImapConfig, Inbox } from "./types";

function client(cfg: ImapConfig) {
  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port !== 143,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    socketTimeout: 30_000,
  });
}

function mapImapError(e: unknown): AppError {
  const err = e as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  const detail = [err.code, err.responseText || err.message].filter(Boolean).join(" | ");
  if (err.authenticationFailed || /auth|login|credentials/i.test(detail)) return new AppError("imap_auth", detail);
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET"].includes(err.code || "")) return new AppError("imap_connect", detail);
  return new AppError("imap_other", detail);
}

export const realInbox: Inbox = {
  async verify(cfg) {
    if (!cfg.host || !cfg.user || !cfg.pass) throw new AppError("imap_missing");
    const c = client(cfg);
    try {
      await c.connect();
      await c.mailboxOpen("INBOX", { readOnly: true });
    } catch (e) {
      throw mapImapError(e);
    } finally {
      await c.logout().catch(() => {});
    }
  },

  async fetchNew(cfg, sinceUid, limit) {
    if (!cfg.host || !cfg.user || !cfg.pass) throw new AppError("imap_missing");
    const c = client(cfg);
    const messages: InboundMessage[] = [];
    let lastUid = sinceUid;
    try {
      await c.connect();
      const box = await c.mailboxOpen("INBOX", { readOnly: true });
      let uids: number[];
      if (sinceUid == null) {
        const since = new Date(Date.now() - 7 * 86400_000);
        uids = ((await c.search({ since }, { uid: true })) || []) as number[];
      } else {
        uids = ((await c.search({ uid: `${sinceUid + 1}:*` }, { uid: true })) || []) as number[];
        uids = uids.filter((u) => u > sinceUid);
      }
      uids.sort((a, b) => a - b);
      uids = uids.slice(0, limit);
      if (!uids.length) {
        // Nothing new: remember the current top so the next check starts there.
        if (sinceUid == null && box.uidNext) lastUid = Number(box.uidNext) - 1;
        return { messages, lastUid };
      }
      for await (const msg of c.fetch(uids.join(","), { uid: true, source: true }, { uid: true })) {
        if (!msg.source) continue;
        const p = await simpleParser(msg.source, { skipImageLinks: true, skipTextToHtml: true });
        const headers: Record<string, string> = {};
        for (const [k, v] of p.headers) headers[k.toLowerCase()] = typeof v === "string" ? v : JSON.stringify(v);
        const ct = p.headers.get("content-type") as { value?: string; params?: Record<string, string> } | undefined;
        const contentType = ct?.value ? `${ct.value}; report-type=${ct.params?.["report-type"] || ""}` : "";
        const refs = Array.isArray(p.references) ? p.references : p.references ? [p.references] : [];
        // Bounce reports carry the failed address in a message/delivery-status part.
        const dsn = p.attachments
          .filter((a) => /delivery-status|rfc822-headers|message\/rfc822/i.test(a.contentType))
          .map((a) => a.content.toString("utf8").slice(0, 5000))
          .join("\n");
        messages.push({
          uid: msg.uid,
          from: p.from?.value?.[0]?.address?.toLowerCase() || "",
          subject: p.subject || "",
          messageId: p.messageId,
          inReplyTo: p.inReplyTo,
          references: refs,
          text: [(p.text || "").slice(0, 20000), dsn].filter(Boolean).join("\n"),
          headers,
          contentType,
          date: p.date?.toISOString(),
        });
        lastUid = Math.max(lastUid ?? 0, msg.uid);
      }
      return { messages, lastUid };
    } catch (e) {
      throw mapImapError(e);
    } finally {
      await c.logout().catch(() => {});
    }
  },
};
