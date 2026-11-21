// Pure contact selection: due follow-ups first, then new contacts; template step/language/A-B choice.
import type { DncSet } from "./emails";
import { isBlocked, isValidEmail } from "./emails";
import type { Row } from "./table";
import { get } from "./table";
import { normalizeLanguage } from "./template";
import { parseDate } from "./time";

export type Template = {
  id: string;
  name: string;
  language: "AR" | "EN";
  step: number;
  delayDays: number;
  subject: string;
  body: string;
  version: string;
  active: boolean;
  _row?: number;
};

export function isYes(v: string | undefined): boolean {
  return ["yes", "y", "true", "1", "on", "نعم", "active", "مفعل"].includes(String(v || "").trim().toLowerCase());
}

export function toTemplate(r: Row): Template {
  return {
    id: get(r, "Template ID"),
    name: get(r, "Name"),
    language: normalizeLanguage(get(r, "Language")),
    step: Number(get(r, "Step") || 0) || 0,
    delayDays: Number(get(r, "Delay Days") || 0) || 0,
    subject: get(r, "Subject"),
    body: get(r, "Body"),
    version: (get(r, "Version") || "A").trim().toUpperCase(),
    active: isYes(get(r, "Active")),
    _row: r._row,
  };
}

/** Stable small hash (FNV-1a) used for A/B assignment by contact ID. */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function activeTemplates(all: Template[], step: number, lang: "AR" | "EN"): Template[] {
  return all.filter((t) => t.active && t.step === step && t.language === lang).sort((a, b) => a.version.localeCompare(b.version));
}

export function chooseTemplate(all: Template[], contact: Row, step: number): Template | null {
  const lang = normalizeLanguage(get(contact, "Language"));
  const list = activeTemplates(all, step, lang);
  if (!list.length) return null;
  if (step === 0) {
    const versions = [...new Set(list.map((t) => t.version))];
    const v = versions[stableHash(get(contact, "ID") || get(contact, "Email")) % versions.length];
    return list.find((t) => t.version === v)!;
  }
  const v = (get(contact, "Version") || "A").toUpperCase();
  return list.find((t) => t.version === v) || list[0];
}

export function hasNextStep(all: Template[], contact: Row, step: number): Template | null {
  return chooseTemplate(all, contact, step);
}

export const STOP_STATUSES = ["Replied", "Bounced", "Unsubscribed", "Completed", "Invalid", "Duplicate"];

export function statusForStep(step: number): string {
  return step === 0 ? "Sent" : `Follow-up ${step}`;
}

export function isSentStatus(status: string): boolean {
  return status === "Sent" || /^Follow-up \d+$/.test(status);
}

export type Filter = { tags?: string[]; language?: string; ids?: string[]; status?: string };

export function parseFilter(s: string | undefined): Filter {
  const f: Filter = {};
  for (const part of String(s || "").split(";")) {
    const [k, ...rest] = part.split(":");
    const v = rest.join(":").trim();
    if (!v) continue;
    const key = k.trim().toLowerCase();
    if (key === "tags") f.tags = v.split(",").map((x) => x.trim()).filter(Boolean);
    else if (key === "language" || key === "lang") f.language = normalizeLanguage(v);
    else if (key === "ids") f.ids = v.split(",").map((x) => x.trim()).filter(Boolean);
    else if (key === "status") f.status = v;
  }
  return f;
}

export function formatFilter(f: Filter): string {
  const parts: string[] = [];
  if (f.tags?.length) parts.push(`tags:${f.tags.join(",")}`);
  if (f.language) parts.push(`language:${f.language}`);
  if (f.ids?.length) parts.push(`ids:${f.ids.join(",")}`);
  if (f.status) parts.push(`status:${f.status}`);
  return parts.join("; ");
}

export function splitTags(v: string): string[] {
  return String(v || "").split(/[,،;]/).map((t) => t.trim()).filter(Boolean);
}

export function matchesFilter(c: Row, f: Filter | undefined): boolean {
  if (!f) return true;
  if (f.ids?.length && !f.ids.includes(get(c, "ID"))) return false;
  if (f.language && normalizeLanguage(get(c, "Language")) !== f.language) return false;
  if (f.status && get(c, "Status") !== f.status) return false;
  if (f.tags?.length) {
    const tags = splitTags(get(c, "Tags")).map((t) => t.toLowerCase());
    if (!f.tags.some((t) => tags.includes(t.toLowerCase()))) return false;
  }
  return true;
}

export type Pick = { contact: Row; step: number; template: Template; kind: "followup" | "first" };
export type Skip = { contact: Row; reason: string };

export type SelectInput = {
  contacts: Row[];
  templates: Template[];
  dnc: DncSet;
  now: Date;
  max: number;
  mode: "manual" | "scheduled" | "auto";
  filter?: Filter;
};

/** Why a contact can't be sent now (or null when it is eligible), plus the step it would get. */
export function eligibility(c: Row, templates: Template[], dnc: DncSet, now: Date, mode: SelectInput["mode"]):
  | { ok: true; step: number; template: Template; kind: Pick["kind"] }
  | { ok: false; reason: string } {
  const status = get(c, "Status").trim() || "New";
  const email = get(c, "Email").trim().toLowerCase();
  if (STOP_STATUSES.includes(status)) return { ok: false, reason: `status_${status.toLowerCase()}` };
  if (!isValidEmail(email)) return { ok: false, reason: "invalid_email" };
  if (isBlocked(email, dnc)) return { ok: false, reason: "dnc" };

  if (isSentStatus(status)) {
    const due = parseDate(get(c, "Next Send At"));
    if (!due) return { ok: false, reason: "no_next_step" };
    if (due.getTime() > now.getTime()) return { ok: false, reason: "not_due" };
    const step = (Number(get(c, "Step")) || 0) + 1;
    const t = chooseTemplate(templates, c, step);
    if (!t) return { ok: false, reason: "no_template" };
    return { ok: true, step, template: t, kind: "followup" };
  }
  if (status === "Ready" || (status === "New" && mode !== "auto")) {
    const t = chooseTemplate(templates, c, 0);
    if (!t) return { ok: false, reason: "no_template" };
    return { ok: true, step: 0, template: t, kind: "first" };
  }
  return { ok: false, reason: status === "New" ? "not_ready" : "unknown_status" };
}

export function selectContacts(input: SelectInput): { picks: Pick[]; skipped: Skip[] } {
  const { contacts, templates, dnc, now, max, mode, filter } = input;
  const followups: (Pick & { due: number })[] = [];
  const firsts: Pick[] = [];
  const skipped: Skip[] = [];
  const pool = filter?.ids?.length
    ? (filter.ids.map((id) => contacts.find((c) => get(c, "ID") === id)).filter(Boolean) as Row[])
    : contacts;
  for (const c of pool) {
    if (!matchesFilter(c, filter)) continue;
    const e = eligibility(c, templates, dnc, now, mode);
    if (!e.ok) {
      if (filter?.ids?.length) skipped.push({ contact: c, reason: e.reason });
      continue;
    }
    const p: Pick = { contact: c, step: e.step, template: e.template, kind: e.kind };
    if (e.kind === "followup") followups.push({ ...p, due: parseDate(get(c, "Next Send At"))!.getTime() });
    else firsts.push(p);
  }
  followups.sort((a, b) => a.due - b.due);
  const ordered: Pick[] = [...followups.map(({ due: _due, ...p }) => p), ...firsts];
  return { picks: ordered.slice(0, Math.max(0, max)), skipped };
}
