// Errors carry a stable code (mapped to friendly Arabic text in content/ar.ts) plus technical detail.

export class AppError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "AppError";
    this.code = code;
    this.detail = detail;
  }
}

export type ErrorInfo = { code: string; detail: string };

/** Duck-typed: `instanceof` can fail when a module is bundled twice (server actions vs RSC). */
export function isAppError(e: unknown, code?: string): e is AppError {
  const ok = !!e && typeof e === "object" && (e as { name?: string }).name === "AppError" && typeof (e as { code?: unknown }).code === "string";
  return ok && (!code || (e as AppError).code === code);
}

export function toErrorInfo(e: unknown): ErrorInfo {
  if (isAppError(e)) return { code: e.code, detail: e.detail || e.message };
  if (e instanceof Error) return { code: "unknown", detail: e.message };
  return { code: "unknown", detail: String(e) };
}
