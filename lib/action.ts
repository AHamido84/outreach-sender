// Uniform result for server actions: friendly code + technical detail on failure.
import { toErrorInfo, type ErrorInfo } from "./errors";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: ErrorInfo };

export async function act<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // Next.js redirect/notFound must propagate
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: toErrorInfo(e) };
  }
}
