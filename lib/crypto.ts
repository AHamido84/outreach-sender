// AES-256-GCM encryption for secrets stored in sheets, and HMAC signing helpers.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { appSecret } from "./env";

const PREFIX = "enc:";

function key(secret: string): Buffer {
  return createHash("sha256").update("outreach-sender:enc:" + secret).digest();
}

export function isEncrypted(v: string | undefined | null): boolean {
  return !!v && v.startsWith(PREFIX);
}

export function encrypt(plain: string, secret = appSecret()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, data]).toString("base64url");
}

export function decrypt(value: string, secret = appSecret()): string {
  if (!isEncrypted(value)) return value; // plain value typed directly in the sheet
  const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
  if (raw.length < 29) throw new Error("Encrypted value is corrupted");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const d = createDecipheriv("aes-256-gcm", key(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/** What the browser may see about a secret: only whether it is set and its last 4 chars. */
export function maskSecret(stored: string | undefined | null, secret = appSecret()): { set: boolean; last4: string } {
  if (!stored) return { set: false, last4: "" };
  try {
    const plain = decrypt(stored, secret);
    return { set: plain.length > 0, last4: plain.slice(-4) };
  } catch {
    return { set: true, last4: "????" };
  }
}

export function hmac(data: string, secret = appSecret()): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Signed token for one-click unsubscribe links. */
export function unsubscribeToken(companyId: string, email: string, secret = appSecret()): string {
  const payload = Buffer.from(JSON.stringify([companyId, email])).toString("base64url");
  return payload + "." + hmac("unsub:" + payload, secret).slice(0, 22);
}

export function verifyUnsubscribeToken(token: string, secret = appSecret()): { companyId: string; email: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, hmac("unsub:" + payload, secret).slice(0, 22))) return null;
  try {
    const [companyId, email] = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof companyId === "string" && typeof email === "string" ? { companyId, email } : null;
  } catch {
    return null;
  }
}
