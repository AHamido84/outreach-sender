// Template variables and rendering. Any empty or unknown variable is reported so sending can be refused.
import { CONTACT_HEADERS } from "./schema";
import type { Row } from "./table";
import { get } from "./table";

export const BUILTIN_VARS = [
  "first_name", "company", "city", "industry", "sender_name", "our_company",
  "profile_link", "booking_link", "signature", "unsubscribe",
] as const;

export function varName(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const TITLE_PREFIXES = /^(mr|mrs|ms|miss|dr|eng|prof|م|د|أ|ا|استاذ|أستاذ|الأستاذ|المهندس|مهندس|دكتور|الدكتور)\.?\s+/i;

export function firstName(fullName: string): string {
  let n = String(fullName || "").trim();
  for (let i = 0; i < 2; i++) n = n.replace(TITLE_PREFIXES, "");
  return n.split(/\s+/)[0] || "";
}

export type VarSources = {
  company: Record<string, string>; // Company tab values
  sender: Record<string, string>; // Sender tab values
  contact?: Row;
  contactHeaders?: string[];
  unsubscribeLink?: string | null;
};

export function buildVars(s: VarSources): Record<string, string> {
  const c = s.contact;
  const unsubLine = (s.sender["Unsubscribe Line"] || "").replace(/\{link\}/g, s.unsubscribeLink || "");
  const vars: Record<string, string> = {
    first_name: c ? firstName(get(c, "Contact Name")) : "",
    company: c ? get(c, "Company") : "",
    city: c ? get(c, "City") : "",
    industry: c ? get(c, "Industry") : "",
    sender_name: s.sender["From Name"] || "",
    our_company: s.company["Company Name"] || "",
    profile_link: s.company["Profile Link"] || "",
    booking_link: s.company["Booking Link"] || "",
    signature: s.company["Signature"] || "",
    unsubscribe: unsubLine,
  };
  // Every Contacts column is available as {column_name}.
  const headers = s.contactHeaders?.length ? s.contactHeaders : CONTACT_HEADERS;
  for (const h of headers) {
    const k = varName(h);
    if (k && !(k in vars)) vars[k] = c ? get(c, h) : "";
  }
  return vars;
}

export type RenderResult = { text: string; missing: string[] };

const VAR_RE = /\{([^{}\n]{1,60})\}/g;

export function usedVars(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text || "").matchAll(VAR_RE)) {
    const k = varName(m[1]);
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

export function render(text: string, vars: Record<string, string>): RenderResult {
  const missing: string[] = [];
  const out = String(text || "").replace(VAR_RE, (_all, name: string) => {
    const k = varName(name);
    const v = vars[k];
    if (v == null || String(v).trim() === "") {
      if (!missing.includes(k)) missing.push(k);
      return "";
    }
    return String(v);
  });
  return { text: out, missing };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function isRtlLanguage(lang: string): boolean {
  return normalizeLanguage(lang) === "AR";
}

export function normalizeLanguage(lang: string | undefined): "AR" | "EN" {
  const l = String(lang || "").trim().toLowerCase();
  if (["en", "english", "eng", "انجليزي", "إنجليزي", "الانجليزية", "الإنجليزية"].includes(l)) return "EN";
  return "AR";
}

/** Plain text body → simple HTML (escaped, links clickable, line breaks), RTL for Arabic. */
export function toHtml(text: string, language: string): string {
  const rtl = isRtlLanguage(language);
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`)
    .replace(/\r?\n/g, "<br>\n");
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  return `<!doctype html><html dir="${dir}"><body><div dir="${dir}" style="direction:${dir};text-align:${align};font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.7;color:#111">${body}</div></body></html>`;
}

export type RenderedEmail = { subject: string; text: string; html: string; missing: string[] };

export function renderEmail(tpl: { subject: string; body: string; language: string }, vars: Record<string, string>): RenderedEmail {
  const s = render(tpl.subject, vars);
  const b = render(tpl.body, vars);
  const missing = [...new Set([...s.missing, ...b.missing])];
  return { subject: s.text.trim(), text: b.text, html: toHtml(b.text, tpl.language), missing };
}
