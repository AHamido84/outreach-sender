import { AppError } from "../errors";

/** fetch JSON with provider-friendly error codes (source_auth / source_forbidden / source_params / source_rate / source_credits / source_api). */
export async function providerFetch<T>(provider: string, url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 45_000);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctl.signal, cache: "no-store" });
  } catch (e) {
    throw new AppError("source_network", `${provider}: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (res.ok) {
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new AppError("source_api", `${provider}: invalid JSON ${text.slice(0, 200)}`);
    }
  }
  const detail = `${provider} ${res.status}: ${text.slice(0, 400)}`;
  if (res.status === 401) throw new AppError("source_auth", detail);
  if (res.status === 402 || /credit|insufficient|quota|usage limit/i.test(text)) throw new AppError("source_credits", detail);
  // Hunter uses 403 for rate limiting; Apollo uses 403 for plan/scope.
  if (res.status === 403 && provider === "hunter") throw new AppError("source_rate", detail);
  if (res.status === 403) throw new AppError("source_forbidden", detail);
  if (res.status === 400 || res.status === 422) throw new AppError("source_params", detail);
  if (res.status === 429) throw new AppError("source_rate", detail);
  throw new AppError("source_api", detail);
}

export const splitList = (v: string | undefined) =>
  String(v || "")
    .split(/[,،\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const str = (v: unknown) => (v == null ? "" : String(v).trim());
