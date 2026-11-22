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

/** Replace {variables}. `escape` transforms values (HTML bodies escape them and keep line breaks as <br>). */
export function render(text: string, vars: Record<string, string>, escape: (v: string, name: string) => string = (v) => v): RenderResult {
  const missing: string[] = [];
  const out = String(text || "").replace(VAR_RE, (_all, name: string) => {
    const k = varName(name);
    const v = vars[k];
    if (v == null || String(v).trim() === "") {
      if (!missing.includes(k)) missing.push(k);
      return "";
    }
    return escape(String(v), k);
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

/** A body saved by the rich editor is HTML; older/plain bodies are plain text. */
export function isHtmlBody(body: string): boolean {
  return /<(p|br|div|a|span|strong|b|em|i|u|s|ul|ol|li|h[1-6])(\s[^>]*)?\/?>/i.test(String(body || ""));
}

/** Plain text → editor HTML (paragraphs on blank lines, <br> on single line breaks). */
export function plainToHtml(text: string): string {
  const t = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

/** HTML body → plain-text alternative part. Links become "text (url)". */
export function htmlToText(html: string): string {
  let s = String(html || "");
  s = s.replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    const url = decodeEntities(href);
    return !label || decodeEntities(label) === url ? url : `${label} (${url})`;
  });
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(p|div|h[1-6])>/gi, "\n\n")
    .replace(/<\/(li|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(s)
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Email clients ignore CSS classes: put spacing on block elements inline. */
function inlineBlockStyles(html: string): string {
  const add = (tag: string, css: string) =>
    (h: string) =>
      h.replace(new RegExp(`<${tag}(\\s[^>]*)?>`, "gi"), (_m, raw = "") => {
        const attrs = String(raw).replace(/\s*\/$/, ""); // tolerate self-closing <img ... />
        const st = attrs.match(/style="([^"]*)"/i);
        if (st) return `<${tag}${attrs.replace(st[0], `style="${css}${st[1]}"`)}>`;
        return `<${tag}${attrs} style="${css}">`;
      });
  return [add("img", "max-width:100%;height:auto;border:0;"), add("p", "margin:0 0 12px;"), add("ul", "margin:0 0 12px;padding-inline-start:24px;"), add("ol", "margin:0 0 12px;padding-inline-start:24px;"), add("a", "color:#0f766e;")].reduce(
    (h, f) => f(h),
    html,
  );
}

function wrapHtml(inner: string, language: string): string {
  const rtl = isRtlLanguage(language);
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  // Web fonts used in the body (e.g. Cairo) are linked; mail apps that don't load them use the fallback font.
  const fonts = /font-family:[^;"]*\bCairo\b/i.test(inner)
    ? `<head><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap" rel="stylesheet"></head>`
    : "";
  return `<!doctype html><html dir="${dir}">${fonts}<body><div dir="${dir}" style="direction:${dir};text-align:${align};font-family:Tahoma,Arial,sans-serif;font-size:14px;line-height:1.7;color:#111">${inner}</div></body></html>`;
}

/** Plain text body → simple HTML (escaped, links clickable, line breaks), RTL for Arabic. */
export function toHtml(text: string, language: string): string {
  const body = escapeHtml(text)
    .replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`)
    .replace(/\r?\n/g, "<br>\n");
  return wrapHtml(body, language);
}

export type RenderedEmail = { subject: string; text: string; html: string; missing: string[] };

const linkify = (escaped: string) => escaped.replace(/(https?:\/\/[^\s<]+)/g, (u) => `<a href="${u}">${u}</a>`);

/** Plain-text body → HTML for sending (escaped, links clickable, paragraphs and line breaks). */
export function plainBodyToHtml(text: string): string {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((para) => (para.trim() === "{signature}" ? "<div>{signature}</div>" : `<p>${linkify(escapeHtml(para)).replace(/\n/g, "<br>")}</p>`))
    .join("");
}

export type RenderOptions = { appendSignature?: boolean };

export function renderEmail(tpl: { subject: string; body: string; language: string }, vars: Record<string, string>, opts: RenderOptions = {}): RenderedEmail {
  const s = render(tpl.subject, vars);
  // Every body is sent as HTML; old plain-text bodies are converted first.
  let body = isHtmlBody(tpl.body) ? tpl.body : plainBodyToHtml(tpl.body);
  const sig = String(vars.signature || "");
  if (opts.appendSignature && sig.trim() && !usedVars(tpl.body).includes("signature")) body += "<div>{signature}</div>";
  // A rich (HTML) signature is a block: don't nest it inside a paragraph.
  if (isHtmlBody(sig)) body = body.replace(/<p[^>]*>\s*\{signature\}\s*<\/p>/gi, "<div>{signature}</div>");
  // Variables used as link targets (href="{booking_link}") are filled first, as plain attribute values.
  const hrefMissing: string[] = [];
  body = body.replace(/href="([^"]*)"/g, (_m, inner: string) => {
    const r = render(inner, vars, escapeHtml);
    hrefMissing.push(...r.missing);
    return `href="${r.text}"`;
  });
  // In text, values are escaped, keep line breaks, and bare URLs become clickable. A rich signature is inserted as-is.
  const b = render(body, vars, (v, name) =>
    name === "signature" && isHtmlBody(v) ? v : linkify(escapeHtml(v)).replace(/\r?\n/g, "<br>"),
  );
  const missing = [...new Set([...s.missing, ...hrefMissing, ...b.missing])];
  return { subject: s.text.trim(), text: htmlToText(b.text), html: wrapHtml(inlineBlockStyles(b.text), tpl.language), missing };
}
