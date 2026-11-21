// Classify inbound mail: bounce (DSN / mailer-daemon), auto-reply, unsubscribe, or a real reply — and match it to a contact.
import { extractEmails } from "./emails";
import type { Row } from "./table";
import { get } from "./table";

export type InboundMessage = {
  uid: number;
  from: string; // address only
  subject: string;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  text: string;
  headers: Record<string, string>; // lowercase header names
  contentType?: string;
  date?: string;
};

export type InboundKind = "bounce" | "unsubscribe" | "reply" | "auto" | "ignore";
export type Classified = { kind: InboundKind; contact?: Row; bouncedEmails?: string[] };

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon|mailerdaemon|bounce[s]?|noreply-dmarc)@/i;
const BOUNCE_SUBJECT =
  /(undeliverable|undelivered mail|delivery status notification \(failure\)|mail delivery (failed|failure|subsystem)|returned mail|delivery has failed|failure notice|could not be delivered|تعذر تسليم|لم يتم التسليم)/i;

export function isBounce(m: InboundMessage): boolean {
  const ct = (m.contentType || m.headers["content-type"] || "").toLowerCase();
  if (ct.includes("multipart/report") && ct.includes("delivery-status")) return true;
  if (m.headers["x-failed-recipients"]) return true;
  if (BOUNCE_FROM.test(m.from) && (BOUNCE_SUBJECT.test(m.subject) || /status:\s*5\.\d/i.test(m.text))) return true;
  return BOUNCE_FROM.test(m.from) && /final-recipient/i.test(m.text);
}

export function bouncedRecipients(m: InboundMessage): string[] {
  const out: string[] = [];
  const add = (e: string) => {
    const v = e.toLowerCase().trim();
    if (v && !out.includes(v)) out.push(v);
  };
  if (m.headers["x-failed-recipients"]) extractEmails(m.headers["x-failed-recipients"]).forEach(add);
  for (const mm of m.text.matchAll(/(?:final|original)-recipient:\s*(?:rfc822;)?\s*<?([^\s>]+@[^\s>]+)>?/gi)) add(mm[1]);
  return out;
}

export function isAutoReply(m: InboundMessage): boolean {
  const auto = (m.headers["auto-submitted"] || "").toLowerCase();
  if (auto && auto !== "no") return true;
  if (m.headers["x-autoreply"] || m.headers["x-autorespond"]) return true;
  if ((m.headers["precedence"] || "").match(/auto_reply|bulk|junk/i)) return true;
  return /^(automatic reply|auto(-|\s)?reply|out of (the )?office|رد تلقائي|خارج المكتب)/i.test(m.subject.trim());
}

/** Remove quoted history ("On ... wrote:", lines starting with ">") so we only look at the new text. */
export function stripQuoted(text: string): string {
  const lines = String(text || "").split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    if (/^(on .+ wrote:|في .+ كتب.*:|-----\s*original message|from:\s|من:\s|________________)/i.test(l)) break;
    if (l.startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

const UNSUB_WORDS = [
  "لا", "لأ", "لا شكرا", "لا شكراً", "لا، شكرا", "غير مهتم", "مش مهتم", "الغاء", "إلغاء", "الغاء الاشتراك",
  "إلغاء الاشتراك", "توقف", "اوقف", "أوقف", "no", "no thanks", "no thank you", "stop", "unsubscribe", "remove",
  "remove me", "not interested", "opt out", "opt-out",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.!؟?،,؛;:«»"'()\-–—]+/g, " ")
    .replace(/[ً-ْ]/g, "") // Arabic diacritics
    .replace(/\s+/g, " ")
    .trim();
}

const UNSUB_SET = new Set(UNSUB_WORDS.map(norm));

/**
 * Only short replies count: the whole new text, or its first line, is one of the stop words.
 * "No problem, let's talk" is NOT an unsubscribe.
 */
export function isUnsubscribe(text: string): boolean {
  const fresh = stripQuoted(text);
  if (!fresh) return false;
  const whole = norm(fresh);
  if (UNSUB_SET.has(whole)) return true;
  const firstLine = norm(fresh.split(/\r?\n/).find((l) => l.trim()) || "");
  if (UNSUB_SET.has(firstLine) && whole.length <= 80) return true;
  return /\b(unsubscribe|remove me from your list)\b/i.test(fresh) && whole.length <= 200;
}

function cleanId(id: string): string {
  return id.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function splitIds(v: string): string[] {
  return String(v || "")
    .split(/[\s,]+/)
    .map(cleanId)
    .filter(Boolean);
}

/** Match by In-Reply-To / References against stored message IDs, then by the sender's address. */
export function matchContact(m: InboundMessage, contacts: Row[]): Row | undefined {
  const ids = new Set([...(m.inReplyTo ? splitIds(m.inReplyTo) : []), ...m.references.flatMap(splitIds)]);
  if (ids.size) {
    const byId = contacts.find((c) =>
      [...splitIds(get(c, "Last Message ID")), ...splitIds(get(c, "Thread References"))].some((x) => ids.has(x)),
    );
    if (byId) return byId;
  }
  const from = m.from.toLowerCase().trim();
  return contacts.find((c) => get(c, "Email").toLowerCase().trim() === from && get(c, "Last Sent At"));
}

export function classifyInbound(m: InboundMessage, contacts: Row[]): Classified {
  if (isBounce(m)) {
    const emails = bouncedRecipients(m);
    let contact = contacts.find((c) => emails.includes(get(c, "Email").toLowerCase().trim()));
    if (!contact) {
      // Fallback: the DSN usually quotes the original message headers.
      contact = matchContact({ ...m, from: "" }, contacts);
      if (!contact) {
        const mentioned = extractEmails(m.text);
        contact = contacts.find((c) => get(c, "Last Sent At") && mentioned.includes(get(c, "Email").toLowerCase().trim()));
      }
    }
    return { kind: "bounce", contact, bouncedEmails: contact ? [get(contact, "Email").toLowerCase()] : emails };
  }
  const contact = matchContact(m, contacts);
  if (!contact) return { kind: "ignore" };
  if (isAutoReply(m)) return { kind: "auto", contact };
  if (isUnsubscribe(m.text)) return { kind: "unsubscribe", contact };
  return { kind: "reply", contact };
}
