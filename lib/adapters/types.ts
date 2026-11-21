import type { InboundMessage } from "../detect";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
};

export type ImapConfig = { host: string; port: number; user: string; pass: string };

export type OutgoingEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  headers?: Record<string, string>;
};

export interface Mailer {
  verify(cfg: SmtpConfig): Promise<void>;
  send(cfg: SmtpConfig, msg: OutgoingEmail): Promise<{ messageId: string }>;
}

export interface Inbox {
  verify(cfg: ImapConfig): Promise<void>;
  /** New messages with UID greater than sinceUid (or recent ones when null). */
  fetchNew(cfg: ImapConfig, sinceUid: number | null, limit: number): Promise<{ messages: InboundMessage[]; lastUid: number | null }>;
}

export type MondayColumn = { id: string; title: string; type: string };
export type MondayBoard = { id: string; name: string; groups: { id: string; title: string }[]; columns: MondayColumn[] };

export interface MondayApi {
  me(token: string): Promise<{ name: string; accountSlug: string }>;
  board(token: string, boardId: string): Promise<MondayBoard>;
  createItem(token: string, boardId: string, groupId: string | null, name: string, values: Record<string, unknown>): Promise<{ id: string }>;
  updateItem(token: string, boardId: string, itemId: string, values: Record<string, unknown>): Promise<void>;
  deleteItem(token: string, itemId: string): Promise<void>;
  createColumn(token: string, boardId: string, title: string, type: string): Promise<{ id: string }>;
}
