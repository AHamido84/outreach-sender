// The sending engine, shared by manual, scheduled and auto runs.
import { randomBytes } from "node:crypto";
import { getMailer } from "./adapters";
import { loadAttachments } from "./attachments";
import { loadCompany, logActivity, senderSettings, type Ctx, type SenderSettings } from "./company";
import { unsubscribeToken } from "./crypto";
import { splitIds } from "./detect";
import { buildDnc, domainOf } from "./emails";
import { appUrl } from "./env";
import { AppError, isAppError, toErrorInfo, type ErrorInfo } from "./errors";
import { syncContactToMonday, type MondayOutcome } from "./monday";
import { TABS } from "./schema";
import {
  activeTemplates, chooseTemplate, isYes, selectContacts, statusForStep, STOP_STATUSES, type Filter, type Pick, type Template,
} from "./selection";
import { getStore } from "./sheets";
import { get, readTables, setKv, toKv, type Row, type Table } from "./table";
import { buildVars, normalizeLanguage, renderEmail } from "./template";
import { addDays, dayKey, inWindow, pacedAllowance, parseDate } from "./time";

export type RunType = "manual" | "scheduled" | "auto";

export type SendResult = {
  contactId: string;
  email: string;
  name: string;
  company: string;
  templateId: string;
  templateName: string;
  step: number;
  subject?: string;
  result: "Sent" | "Failed" | "Preview" | "Skipped";
  error?: ErrorInfo;
  missing?: string[];
  messageId?: string;
  monday?: MondayOutcome;
};

export type RunOptions = {
  runType: RunType;
  runId?: string;
  /** Max emails requested (manual count / schedule remaining). Defaults to Emails Per Run. */
  max?: number;
  filter?: Filter;
  /** Manual only: send outside the window after confirmation. Never overrides the daily limit or DNC. */
  overrideWindow?: boolean;
  dryRun?: boolean;
  /** Epoch ms after which no new email is started. */
  deadline?: number;
  /** Wait "Delay Between Emails" between messages (off for client-driven manual batches of 1). */
  sleepBetween?: boolean;
  /** "Run now" from the auto panel: one batch immediately (still window + limits), ignoring pacing and the on/off switch. */
  runNow?: boolean;
  now?: Date;
};

export type StopReason =
  | "sender_not_configured" | "daily_limit" | "outside_window" | "not_due_yet" | "locked" | "auto_off"
  | "auto_blocked" | "smtp_auth" | "empty_variable" | "deadline" | "nothing_to_send" | "bounce_guard";

export type RunOutcome = {
  runId: string;
  results: SendResult[];
  stopped?: StopReason;
  sentToday: number;
  dailyLimit: number;
  planned: number;
};

export function newRunId(type: RunType): string {
  const t = new Date().toISOString().replace(/[-:T]/g, "").slice(2, 12);
  return `${type[0].toUpperCase()}${t}-${randomBytes(2).toString("hex")}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function countSentToday(log: Row[], now: Date, tz: string): number {
  const today = dayKey(now, tz);
  let n = 0;
  for (const r of log) {
    if (get(r, "Result") !== "Sent") continue;
    const d = parseDate(get(r, "Time"));
    if (d && dayKey(d, tz) === today) n++;
  }
  return n;
}

export function bounceStats(contacts: Row[]) {
  let sent = 0;
  let bounced = 0;
  for (const c of contacts) {
    if (!get(c, "Last Sent At")) continue;
    sent++;
    if (get(c, "Status") === "Bounced") bounced++;
  }
  return { sent, bounced, rate: sent ? (bounced / sent) * 100 : 0 };
}

export function senderReady(s: SenderSettings): boolean {
  return !!(s.smtp.host && s.smtp.user && s.smtp.pass && s.smtp.fromEmail);
}

/** Reasons auto sending can't be (or stay) on. Empty list = ready. */
export function autoBlockers(ctx: Ctx, s = senderSettings(ctx)): string[] {
  const out: string[] = [];
  if (!senderReady(s)) out.push("sender_not_configured");
  if (!s.smtpTestedAt) out.push("smtp_not_tested");
  const langs = new Set<string>();
  for (const c of ctx.t[TABS.contacts].rows) {
    const st = get(c, "Status") || "New";
    if (!STOP_STATUSES.includes(st)) langs.add(normalizeLanguage(get(c, "Language")));
  }
  if (!langs.size) langs.add("AR");
  for (const l of langs) if (!activeTemplates(ctx.templates, 0, l as "AR" | "EN").length) out.push(`no_template_${l}`);
  return out;
}

export async function disableAuto(ctx: Ctx, reason: string, details: string) {
  setKv(ctx.w, ctx.sender, "Auto Sending", "off");
  setKv(ctx.w, ctx.sender, "Auto Off Reason", reason);
  await ctx.w.flush();
  await logActivity(ctx, "Auto sending stopped", `${reason}: ${details}`);
}

/** Bounce guard: after ≥20 sent contacts, switch auto off if the bounce rate exceeds the max. */
export async function bounceGuard(ctx: Ctx): Promise<boolean> {
  const s = senderSettings(ctx);
  const b = bounceStats(ctx.t[TABS.contacts].rows);
  if (b.sent >= 20 && b.rate > s.maxBounce) {
    if (s.auto) await disableAuto(ctx, "bounce_rate", `${b.rate.toFixed(1)}% > ${s.maxBounce}% (${b.bounced}/${b.sent})`);
    return true;
  }
  return false;
}

// ---- Lock (a cell in the Sender tab) ----
const LOCK_TTL_MS = 10 * 60_000;

export async function acquireLock(ctx: Ctx, runId: string): Promise<void> {
  const store = getStore();
  store.invalidate(ctx.sheetId);
  const fresh = toKv((await readTables(store, ctx.sheetId, [TABS.sender]))[TABS.sender]);
  const [holder, at] = (fresh.values["Lock"] || "").split("|");
  const atMs = parseDate(at)?.getTime() || 0;
  if (holder && holder !== runId && Date.now() - atMs < LOCK_TTL_MS) throw new AppError("locked", holder);
  ctx.sender = fresh;
  setKv(ctx.w, ctx.sender, "Lock", `${runId}|${new Date().toISOString()}`);
  await ctx.w.flush();
}

export async function releaseLock(ctx: Ctx, runId: string) {
  if ((ctx.sender.values["Lock"] || "").startsWith(runId + "|")) {
    setKv(ctx.w, ctx.sender, "Lock", "");
    await ctx.w.flush().catch(() => {});
  }
}

function messageIdFor(fromEmail: string): string {
  return `<${Date.now().toString(36)}.${randomBytes(6).toString("hex")}@${domainOf(fromEmail) || "outreach.local"}>`;
}

/** Compose the email for one pick (also used by preview). */
export function composeFor(ctx: Ctx, s: SenderSettings, pick: Pick) {
  const c = pick.contact;
  const base = appUrl();
  const email = get(c, "Email").trim().toLowerCase();
  const token = base ? unsubscribeToken(ctx.sheetId, email) : "";
  const link = base ? `${base}/u/${token}` : null; // human page (used in {unsubscribe})
  const oneClick = base ? `${base}/api/unsubscribe/${token}` : null; // RFC 8058 one-click POST
  const vars = buildVars({
    company: ctx.company.values,
    sender: ctx.sender.values,
    contact: c,
    contactHeaders: ctx.t[TABS.contacts].headers,
    unsubscribeLink: link,
  });
  const rendered = renderEmail(pick.template, vars, { appendSignature: isYes(ctx.company.values["Append Signature"]) });
  let subject = rendered.subject;
  let inReplyTo: string | undefined;
  let references: string[] | undefined;
  if (pick.step > 0) {
    // Same thread: "Re: <first subject>" + In-Reply-To/References from stored message IDs.
    const first = chooseTemplate(ctx.templates, c, 0);
    const firstSubject = first ? renderEmail(first, vars).subject : rendered.subject;
    subject = /^re:/i.test(firstSubject) ? firstSubject : `Re: ${firstSubject}`;
    inReplyTo = get(c, "Last Message ID") || undefined;
    const refs = splitIds(get(c, "Thread References")).map((x) => `<${x}>`);
    references = refs.length ? refs : inReplyTo ? [inReplyTo] : undefined;
  }
  if (!subject.trim() && !rendered.missing.length) rendered.missing.push("subject");
  const replyTo = s.smtp.replyTo || s.smtp.fromEmail;
  const headers: Record<string, string> = {
    "List-Unsubscribe": [`<mailto:${replyTo}?subject=unsubscribe>`, oneClick ? `<${oneClick}>` : ""].filter(Boolean).join(", "),
  };
  if (oneClick) headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  return { to: email, subject, text: rendered.text, html: rendered.html, missing: rendered.missing, inReplyTo, references, headers };
}

function nextSendAt(ctx: Ctx, c: Row, step: number, now: Date): { status: string; next: string; nextTpl: Template | null } {
  const nextTpl = chooseTemplate(ctx.templates, c, step + 1);
  if (!nextTpl) return { status: step === 0 ? "Sent" : "Completed", next: "", nextTpl };
  return { status: statusForStep(step), next: addDays(now, Math.max(0, nextTpl.delayDays)).toISOString(), nextTpl };
}

function resultBase(p: Pick): Omit<SendResult, "result"> {
  return {
    contactId: get(p.contact, "ID"),
    email: get(p.contact, "Email"),
    name: get(p.contact, "Contact Name"),
    company: get(p.contact, "Company"),
    templateId: p.template.id,
    templateName: p.template.name,
    step: p.step,
  };
}

export async function runBatch(companyId: string, opts: RunOptions): Promise<RunOutcome> {
  const ctx = await loadCompany(companyId, [TABS.sendLog]);
  return runBatchWith(ctx, opts);
}

export async function runBatchWith(ctx: Ctx, opts: RunOptions): Promise<RunOutcome> {
  const now = opts.now || new Date();
  const runId = opts.runId || newRunId(opts.runType);
  const s = senderSettings(ctx);
  const log: Table = ctx.t[TABS.sendLog];
  const contacts: Table = ctx.t[TABS.contacts];
  const sentToday = countSentToday(log.rows, now, s.tz);
  const out: RunOutcome = { runId, results: [], sentToday, dailyLimit: s.dailyLimit, planned: 0 };

  if (!senderReady(s)) return { ...out, stopped: "sender_not_configured" };
  if (opts.runType === "auto") {
    if (!s.auto && !opts.runNow) return { ...out, stopped: "auto_off" };
    if (autoBlockers(ctx, s).length) return { ...out, stopped: "auto_blocked" };
  }
  const remaining = Math.max(0, s.dailyLimit - sentToday);
  if (!remaining) return { ...out, stopped: "daily_limit" };
  const windowOk = inWindow(now, s.window);
  if (!windowOk && opts.runType === "auto") return { ...out, stopped: "outside_window" };
  if (!windowOk && opts.runType === "manual" && !opts.overrideWindow && !opts.dryRun) return { ...out, stopped: "outside_window" };

  let max = Math.min(opts.max ?? s.perRun, remaining);
  if (opts.runType === "auto" && !opts.runNow) {
    max = Math.min(max, pacedAllowance({ now, w: s.window, dailyLimit: s.dailyLimit, sentToday, perRun: s.perRun }));
    if (max <= 0) return { ...out, stopped: "not_due_yet" };
  }

  const dnc = buildDnc(ctx.t[TABS.dnc].rows.map((r) => get(r, "Email or Domain")));
  const { picks, skipped } = selectContacts({
    contacts: contacts.rows, templates: ctx.templates, dnc, now, max, mode: opts.runType, filter: opts.filter,
  });
  out.planned = picks.length;
  for (const sk of skipped) {
    out.results.push({
      contactId: get(sk.contact, "ID"), email: get(sk.contact, "Email"), name: get(sk.contact, "Contact Name"),
      company: get(sk.contact, "Company"), templateId: "", templateName: "", step: 0, result: "Skipped",
      error: { code: sk.reason, detail: sk.reason },
    });
  }

  if (opts.dryRun) {
    for (const p of picks) {
      const m = composeFor(ctx, s, p);
      out.results.push({ ...resultBase(p), subject: m.subject, missing: m.missing, result: "Preview" });
    }
    return out;
  }
  if (!picks.length) return { ...out, stopped: "nothing_to_send" };

  try {
    await acquireLock(ctx, runId);
  } catch (e) {
    if (isAppError(e, "locked")) return { ...out, stopped: "locked" };
    throw e;
  }

  const mailer = getMailer();
  let sentNow = 0;
  let authFailed = false;
  try {
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (opts.deadline && Date.now() > opts.deadline) {
        out.stopped = "deadline";
        break;
      }
      const base = resultBase(p);
      const m = composeFor(ctx, s, p);
      const sentAt = new Date();
      const logRow = {
        Time: sentAt.toISOString(), "Run ID": runId, "Run Type": opts.runType, "Contact ID": base.contactId,
        Email: base.email, Template: p.template.id || p.template.name, Step: String(p.step),
      };
      if (m.missing.length) {
        const error = { code: "missing_vars", detail: m.missing.join(", ") };
        ctx.w.update(contacts, p.contact, { Error: `Missing: ${error.detail}` });
        ctx.w.append(log, { ...logRow, Result: "Skipped", Error: `missing_vars: ${error.detail}` });
        out.results.push({ ...base, subject: m.subject, missing: m.missing, result: "Skipped", error });
        await ctx.w.flush();
        if (opts.runType === "auto") {
          await disableAuto(ctx, "empty_variable", `${base.contactId}: ${error.detail}`);
          out.stopped = "empty_variable";
          break;
        }
        continue;
      }
      let attachments: Awaited<ReturnType<typeof loadAttachments>> = [];
      try {
        attachments = await loadAttachments(p.template.attachments);
      } catch (e) {
        // A broken attachment link must not send an incomplete email.
        const error = toErrorInfo(e);
        ctx.w.update(contacts, p.contact, { Error: `${error.code}: ${error.detail}`.slice(0, 300) });
        ctx.w.append(log, { ...logRow, Result: "Skipped", Error: `${error.code}: ${error.detail}`.slice(0, 500) });
        out.results.push({ ...base, subject: m.subject, result: "Skipped", error });
        await ctx.w.flush();
        continue;
      }
      const messageId = messageIdFor(s.smtp.fromEmail);
      try {
        await mailer.send(s.smtp, { to: m.to, subject: m.subject, text: m.text, html: m.html, messageId, inReplyTo: m.inReplyTo, references: m.references, headers: m.headers, attachments });
      } catch (e) {
        const error = toErrorInfo(e);
        ctx.w.update(contacts, p.contact, { Error: `${error.code}: ${error.detail}`.slice(0, 300) });
        ctx.w.append(log, { ...logRow, Result: "Failed", Error: `${error.code}: ${error.detail}`.slice(0, 500) });
        out.results.push({ ...base, subject: m.subject, result: "Failed", error });
        await ctx.w.flush();
        if (error.code === "smtp_auth" || error.code === "smtp_connect" || error.code === "smtp_missing") {
          authFailed = error.code === "smtp_auth";
          out.stopped = "smtp_auth";
          break;
        }
        continue;
      }
      sentNow++;
      const refs = [...splitIds(get(p.contact, "Thread References")).map((x) => `<${x}>`), messageId].join(" ");
      const ns = nextSendAt(ctx, p.contact, p.step, sentAt);
      ctx.w.update(contacts, p.contact, {
        Status: ns.status,
        Step: String(p.step),
        Version: p.template.version,
        "Last Sent At": sentAt.toISOString(),
        "Next Send At": ns.next,
        "Last Message ID": messageId,
        "Thread References": refs,
        Error: "",
      });
      let monday: MondayOutcome | undefined;
      try {
        monday = await syncContactToMonday(ctx, p.contact, "send");
      } catch (e) {
        monday = { ok: false, error: toErrorInfo(e).detail };
      }
      ctx.w.append(log, {
        ...logRow,
        Result: "Sent",
        "Message ID": messageId,
        "monday Result": monday?.skipped ? "—" : monday?.ok ? "Synced" : "Failed",
        "monday Error": monday?.error || "",
      });
      await ctx.w.flush();
      out.results.push({ ...base, subject: m.subject, result: "Sent", messageId, monday });

      const more = i < picks.length - 1;
      if (more && opts.sleepBetween !== false && s.delaySec > 0) {
        const wait = s.delaySec * 1000;
        if (opts.deadline && Date.now() + wait > opts.deadline) {
          out.stopped = "deadline";
          break;
        }
        await sleep(wait);
      }
    }
  } finally {
    const failures = authFailed ? (Number(ctx.sender.values["Auth Failures In A Row"]) || 0) + 1 : sentNow ? 0 : Number(ctx.sender.values["Auth Failures In A Row"]) || 0;
    const summary = `sent ${sentNow}/${picks.length}${out.stopped ? ` (${out.stopped})` : ""}`;
    setKv(ctx.w, ctx.sender, "Auth Failures In A Row", String(failures));
    setKv(ctx.w, ctx.sender, "Last Run At", new Date().toISOString());
    setKv(ctx.w, ctx.sender, "Last Run ID", runId);
    setKv(ctx.w, ctx.sender, "Last Run Result", `${opts.runType}: ${summary}`);
    if (opts.runType === "auto" && sentNow) setKv(ctx.w, ctx.sender, "Last Auto Send At", new Date().toISOString());
    await ctx.w.flush().catch(() => {});
    await releaseLock(ctx, runId);
    if (failures >= 3 && s.auto) await disableAuto(ctx, "smtp_auth", `${failures} runs in a row failed SMTP login`);
    await bounceGuard(ctx).catch(() => {});
    if (opts.runType !== "manual" || picks.length > 1) await logActivity(ctx, `Run ${opts.runType}`, `${runId}: ${summary}`);
  }
  out.sentToday = sentToday + sentNow;
  return out;
}
