// Central place for environment configuration.
// Demo mode: DEMO=1, or no Google service account configured (e.g. Vercel Preview without env vars).

export function isDemo(): boolean {
  if (process.env.DEMO === "1" || process.env.DEMO === "true") return true;
  return !process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

const DEMO_SECRET = "demo-secret-not-for-production-use-0000000000";

export function appSecret(): string {
  const s = process.env.APP_SECRET;
  if (s && s.length >= 16) return s;
  if (isDemo()) return DEMO_SECRET;
  throw new Error("APP_SECRET is missing or shorter than 16 characters");
}

export function appPassword(): string {
  const p = process.env.APP_PASSWORD;
  if (p) return p;
  if (isDemo()) return "demo";
  throw new Error("APP_PASSWORD is not set");
}

export function cronSecret(): string {
  return process.env.CRON_SECRET || (isDemo() ? "demo" : "");
}

export function registrySheetId(): string {
  return process.env.REGISTRY_SHEET_ID || (isDemo() ? "demo-registry" : "");
}

/** Public base URL of the app (used for one-click unsubscribe links). */
export function appUrl(): string | null {
  const u =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return u ? u.replace(/\/$/, "") : null;
}
