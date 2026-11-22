// Fake SMTP / IMAP / monday for demo mode. Simulates replies, bounces and unsubscribes after sends.
import type { InboundMessage } from "../detect";
import { AppError } from "../errors";
import { stableHash } from "../selection";
import type { Inbox, Mailer, MondayApi, MondayBoard } from "../adapters/types";

type DemoState = {
  outbox: { at: string; to: string; subject: string; messageId: string }[];
  inbox: (InboundMessage & { arriveAt: number })[];
  nextUid: number;
  boards: Map<string, MondayBoard & { items: Map<string, { name: string; values: Record<string, unknown> }> }>;
  nextItem: number;
};

const g = globalThis as unknown as { __demoState?: DemoState };

export function demoState(): DemoState {
  if (!g.__demoState) {
    g.__demoState = {
      outbox: [],
      inbox: [],
      nextUid: 100,
      nextItem: 9000001,
      boards: new Map([
        [
          "1234567890",
          {
            id: "1234567890",
            name: "Outreach Leads",
            groups: [
              { id: "topics", title: "Leads" },
              { id: "group_replied", title: "Replied" },
            ],
            columns: [
              { id: "name", title: "Name", type: "name" },
              { id: "email_mk1", title: "Email", type: "email" },
              { id: "status", title: "Status", type: "status" },
              { id: "numbers_step", title: "Step", type: "numbers" },
              { id: "date_last", title: "Last Sent", type: "date" },
              { id: "date_next", title: "Next Send", type: "date" },
              { id: "text_company", title: "Company", type: "text" },
              { id: "text_person", title: "Person", type: "text" },
              { id: "phone_mk1", title: "Phone", type: "phone" },
              { id: "link_web", title: "Website", type: "link" },
            ],
            items: new Map(),
          },
        ],
      ]),
    };
  }
  return g.__demoState;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const fakeMailer: Mailer = {
  async verify(cfg) {
    await sleep(400);
    if (!cfg.host || !cfg.user || !cfg.pass) throw new AppError("smtp_missing");
    if (/wrong|bad/i.test(cfg.pass)) throw new AppError("smtp_auth", "535-5.7.8 Username and Password not accepted (demo)");
    if (/invalid/i.test(cfg.host)) throw new AppError("smtp_connect", "getaddrinfo ENOTFOUND " + cfg.host);
  },
  async send(cfg, msg) {
    await sleep(250);
    if (/wrong|bad/i.test(cfg.pass)) throw new AppError("smtp_auth", "535-5.7.8 Username and Password not accepted (demo)");
    if (/fail/i.test(msg.to)) throw new AppError("smtp_recipient", "550 5.1.1 The email account that you tried to reach does not exist (demo)");
    const st = demoState();
    st.outbox.push({ at: new Date().toISOString(), to: msg.to, subject: msg.subject, messageId: msg.messageId });
    // Simulate what happens next in the real world.
    const h = stableHash(msg.to + msg.subject) % 100;
    const arriveAt = Date.now() + 60_000 + (h % 5) * 30_000;
    const base = { uid: 0, references: [msg.messageId], inReplyTo: msg.messageId, headers: {}, arriveAt };
    if (/bounce/i.test(msg.to) || h < 6) {
      st.inbox.push({
        ...base, uid: st.nextUid++, from: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)",
        contentType: "multipart/report; report-type=delivery-status", text: `Final-Recipient: rfc822; ${msg.to}\nStatus: 5.1.1`,
        inReplyTo: undefined, references: [],
      });
    } else if (h < 12) {
      st.inbox.push({ ...base, uid: st.nextUid++, from: msg.to, subject: "Re: " + msg.subject, text: "لا، شكراً" });
    } else if (h < 26) {
      st.inbox.push({ ...base, uid: st.nextUid++, from: msg.to, subject: "Re: " + msg.subject, text: "أهلاً، مهتم. ممكن نتكلم يوم الأحد؟" });
    }
    return { messageId: msg.messageId };
  },
};

export const fakeInbox: Inbox = {
  async verify(cfg) {
    await sleep(400);
    if (!cfg.host || !cfg.user || !cfg.pass) throw new AppError("imap_missing");
    if (/wrong|bad/i.test(cfg.pass)) throw new AppError("imap_auth", "AUTHENTICATIONFAILED Invalid credentials (demo)");
  },
  async fetchNew(_cfg, sinceUid, limit) {
    const st = demoState();
    const now = Date.now();
    const msgs = st.inbox.filter((m) => m.uid > (sinceUid ?? 0) && m.arriveAt <= now).slice(0, limit);
    const last = msgs.length ? msgs[msgs.length - 1].uid : sinceUid;
    return { messages: msgs.map(({ arriveAt: _a, ...m }) => m), lastUid: last };
  },
};

export const fakeMonday: MondayApi = {
  async me(token) {
    if (token === "bad") throw new AppError("monday_auth", "Not Authenticated (demo)");
    return { name: "Demo User", accountSlug: "demo-account" };
  },
  async board(token, boardId) {
    if (token === "bad") throw new AppError("monday_auth", "Not Authenticated (demo)");
    const b = demoState().boards.get(boardId);
    if (!b) throw new AppError("monday_board_not_found", boardId);
    return { id: b.id, name: b.name, groups: b.groups, columns: b.columns };
  },
  async createItem(token, boardId, _groupId, name, values) {
    if (token === "bad") throw new AppError("monday_auth", "Not Authenticated (demo)");
    if (JSON.stringify(values).includes("mfail")) throw new AppError("monday_api", "ColumnValueException: invalid email value (demo)");
    const b = demoState().boards.get(boardId);
    if (!b) throw new AppError("monday_board_not_found", boardId);
    const id = String(demoState().nextItem++);
    b.items.set(id, { name, values });
    return { id };
  },
  async updateItem(_token, boardId, itemId, values) {
    if (JSON.stringify(values).includes("mfail")) throw new AppError("monday_api", "ColumnValueException: invalid email value (demo)");
    const b = demoState().boards.get(boardId);
    const it = b?.items.get(itemId);
    if (it) Object.assign(it.values, values);
  },
  async deleteItem(_token, itemId) {
    for (const b of demoState().boards.values()) b.items.delete(itemId);
  },
  async createColumn(_token, boardId, title, type) {
    const b = demoState().boards.get(boardId);
    if (!b) throw new AppError("monday_board_not_found", boardId);
    const id = `${type}_${Math.random().toString(36).slice(2, 7)}`;
    b.columns.push({ id, title, type });
    return { id };
  },
};
