// Errors carry a stable code (mapped to friendly Arabic text in content/ar.ts) plus technical detail.

export class AppError extends Error {
  code: string;
  detail?: string;
  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
  }
}

export type ErrorInfo = { code: string; detail: string };

export function toErrorInfo(e: unknown): ErrorInfo {
  if (e instanceof AppError) return { code: e.code, detail: e.detail || e.message };
  if (e instanceof Error) return { code: "unknown", detail: e.message };
  return { code: "unknown", detail: String(e) };
}
