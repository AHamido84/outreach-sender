// Email cleaning, validation, domain helpers and import deduplication.

export const FREE_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com", "live.com", "msn.com",
  "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "mail.com", "gmx.com", "yandex.com",
  "zoho.com", "yahoo.co.uk", "hotmail.co.uk", "outlook.sa", "hotmail.fr",
]);

const EMAIL_RE = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const VALID_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function isValidEmail(e: string): boolean {
  if (!e || e.length > 254) return false;
  if (!VALID_RE.test(e)) return false;
  const [local, domain] = e.split("@");
  return !local.startsWith(".") && !local.endsWith(".") && !local.includes("..") && !domain.includes("..");
}

export function extractEmails(cell: string): string[] {
  if (!cell) return [];
  const s = String(cell).replace(/mailto:/gi, " ").toLowerCase();
  const found = s.match(EMAIL_RE) || [];
  const out: string[] = [];
  for (const f of found) {
    const e = f.replace(/^[.'-]+|[.'-]+$/g, "");
    if (!out.includes(e)) out.push(e);
  }
  return out;
}

export function domainOf(email: string): string {
  const i = email.lastIndexOf("@");
  return i >= 0 ? email.slice(i + 1).toLowerCase().trim() : "";
}

export function websiteDomain(url: string | undefined): string {
  if (!url) return "";
  let s = String(url).trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "");
  s = s.split(/[/?#:\s]/)[0];
  return s.includes(".") ? s : "";
}

function sameSite(emailDomain: string, site: string): boolean {
  if (!emailDomain || !site) return false;
  return emailDomain === site || emailDomain.endsWith("." + site) || site.endsWith("." + emailDomain);
}

/**
 * Clean an email cell: lowercase, trim, and when the cell has several emails,
 * pick the one matching the website's domain (else the first valid one).
 */
export function cleanEmail(cell: string, website?: string): { email: string; valid: boolean; all: string[] } {
  const all = extractEmails(cell);
  if (!all.length) {
    const raw = String(cell || "").trim().toLowerCase();
    return { email: raw, valid: false, all: [] };
  }
  const site = websiteDomain(website);
  const match = site ? all.find((e) => sameSite(domainOf(e), site)) : undefined;
  const pick = match || all.find(isValidEmail) || all[0];
  return { email: pick, valid: isValidEmail(pick), all };
}

/** The "company domain" used for duplicate detection; free mail providers don't count. */
export function companyDomain(email: string, website?: string): string {
  const site = websiteDomain(website);
  if (site && !FREE_DOMAINS.has(site)) return site;
  const d = domainOf(email);
  return d && !FREE_DOMAINS.has(d) ? d : "";
}

// ---- Do Not Contact ----

export type DncSet = { emails: Set<string>; domains: Set<string> };

export function buildDnc(entries: string[]): DncSet {
  const set: DncSet = { emails: new Set(), domains: new Set() };
  for (const raw of entries) {
    const v = String(raw || "").trim().toLowerCase();
    if (!v) continue;
    if (v.startsWith("@")) set.domains.add(v.slice(1));
    else if (v.includes("@")) set.emails.add(v);
    else set.domains.add(websiteDomain(v) || v);
  }
  return set;
}

export function isBlocked(email: string, dnc: DncSet): boolean {
  const e = email.toLowerCase().trim();
  if (dnc.emails.has(e)) return true;
  const d = domainOf(e);
  for (const dom of dnc.domains) if (d === dom || d.endsWith("." + dom)) return true;
  return false;
}

// ---- Import classification ----

export type ImportRowStatus = "valid" | "invalid" | "duplicate" | "dnc";
export type ImportCheck = { status: ImportRowStatus; email: string; reason?: string };

export type DedupOptions = {
  /** Allow several people at the same company domain (only the exact same email is a duplicate). */
  allowSameDomain?: boolean;
  /** Allow importing people who already exist in the sheet (emailed before). Duplicates inside the file still count. */
  allowResend?: boolean;
};

export function classifyImport(
  rows: { email: string; website?: string }[],
  existing: { email: string; website?: string }[],
  dnc: DncSet,
  opts: DedupOptions = {},
): ImportCheck[] {
  const seenEmails = new Set<string>();
  const seenDomains = new Set<string>();
  const existingEmails = new Set<string>();
  for (const e of existing) {
    const c = cleanEmail(e.email, e.website);
    if (c.email) existingEmails.add(c.email);
    if (opts.allowResend) continue;
    if (c.email) seenEmails.add(c.email);
    const d = companyDomain(c.email, e.website);
    if (d) seenDomains.add(d);
  }
  return rows.map((r) => {
    const c = cleanEmail(r.email, r.website);
    if (!c.valid) return { status: "invalid", email: c.email, reason: "invalid_email" };
    // Do Not Contact (bounces, unsubscribes, manual) is never overridden.
    if (isBlocked(c.email, dnc)) return { status: "dnc", email: c.email, reason: "dnc" };
    if (seenEmails.has(c.email)) return { status: "duplicate", email: c.email, reason: "same_email" };
    const d = companyDomain(c.email, r.website);
    if (!opts.allowSameDomain && d && seenDomains.has(d)) return { status: "duplicate", email: c.email, reason: "same_domain" };
    seenEmails.add(c.email);
    if (d) seenDomains.add(d);
    return existingEmails.has(c.email) ? { status: "valid", email: c.email, reason: "resend" } : { status: "valid", email: c.email };
  });
}
