// Template attachments are file links (Google Drive / Dropbox / any public URL), downloaded at send time.
import { isDemo } from "./env";
import { AppError } from "./errors";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export type AttachmentRef = { name?: string; url: string };
export type LoadedAttachment = { filename: string; content: Buffer; contentType: string; size: number };

/** One attachment per line: "URL" or "File name | URL". */
export function parseAttachments(raw: string | undefined): AttachmentRef[] {
  return String(raw || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.lastIndexOf("|");
      if (i > 0) return { name: l.slice(0, i).trim() || undefined, url: l.slice(i + 1).trim() };
      return { url: l };
    })
    .filter((a) => /^https?:\/\//i.test(a.url));
}

export function formatAttachments(list: AttachmentRef[]): string {
  return list
    .filter((a) => a.url.trim())
    .map((a) => (a.name?.trim() ? `${a.name.trim()} | ${a.url.trim()}` : a.url.trim()))
    .join("\n");
}

/** Share links → direct download links. */
export function directUrl(url: string): string {
  const u = url.trim();
  let m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || u.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]+)/);
  if (m) return `https://drive.google.com/uc?export=download&id=${m[1]}`;
  m = u.match(/docs\.google\.com\/(document|presentation|spreadsheets)\/d\/([\w-]+)/);
  if (m) return `https://docs.google.com/${m[1]}/d/${m[2]}/export?format=${m[1] === "spreadsheets" ? "xlsx" : "pdf"}`;
  if (/dropbox\.com\//.test(u)) return u.replace(/([?&])dl=0/, "$1dl=1").replace(/^(?!.*[?&]dl=1)(.*)$/, (s) => s + (s.includes("?") ? "&dl=1" : "?dl=1"));
  return u;
}

function nameFrom(res: Response, url: string, fallback?: string): string {
  if (fallback) return fallback;
  const cd = res.headers.get("content-disposition") || "";
  const star = cd.match(/filename\*=(?:UTF-8'')?([^;]+)/i);
  if (star) return decodeURIComponent(star[1].replace(/"/g, "").trim());
  const plain = cd.match(/filename="?([^";]+)"?/i);
  if (plain) return plain[1].trim();
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "attachment";
  return decodeURIComponent(last);
}

const cache = new Map<string, { at: number; value: Promise<LoadedAttachment> }>();
const TTL = 10 * 60_000;

async function download(ref: AttachmentRef): Promise<LoadedAttachment> {
  if (isDemo()) {
    const content = Buffer.from(`Demo attachment for ${ref.url}\n`);
    return { filename: ref.name || ref.url.split("/").pop() || "file.pdf", content, contentType: "application/pdf", size: 245_760 };
  }
  const url = directUrl(ref.url);
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000), cache: "no-store" });
  } catch (e) {
    throw new AppError("attachment_failed", `${ref.url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new AppError("attachment_failed", `${ref.url}: HTTP ${res.status}`);
  const type = (res.headers.get("content-type") || "application/octet-stream").split(";")[0].trim();
  // Google Drive returns an HTML page when the file isn't public (or needs a virus-scan confirmation).
  if (type === "text/html") throw new AppError("attachment_not_public", ref.url);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_FILE_BYTES) throw new AppError("attachment_too_big", `${ref.url}: ${(len / 1048576).toFixed(1)} MB`);
  const content = Buffer.from(await res.arrayBuffer());
  if (content.length > MAX_FILE_BYTES) throw new AppError("attachment_too_big", `${ref.url}: ${(content.length / 1048576).toFixed(1)} MB`);
  return { filename: nameFrom(res, url, ref.name), content, contentType: type, size: content.length };
}

export function loadAttachment(ref: AttachmentRef): Promise<LoadedAttachment> {
  const key = `${ref.name || ""}|${ref.url}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = download(ref);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}

/** Load all attachments of a template (cached for 10 minutes, so a batch downloads each file once). */
export async function loadAttachments(raw: string | undefined): Promise<LoadedAttachment[]> {
  const refs = parseAttachments(raw);
  const files = await Promise.all(refs.map(loadAttachment));
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL_BYTES) throw new AppError("attachment_too_big", `total ${(total / 1048576).toFixed(1)} MB`);
  return files;
}
