// Display formatting helpers (safe on server and client).
export function fmtDate(iso: string | null | undefined, tz?: string, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
      timeZone: tz || undefined, day: "numeric", month: "short", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "—";
  const diff = Math.round((d - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("ar", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(diff, "minute");
  if (abs < 60 * 24) return rtf.format(Math.round(diff / 60), "hour");
  return rtf.format(Math.round(diff / 1440), "day");
}

export function pct(n: number): string {
  return `${(Math.round(n * 10) / 10).toLocaleString("en-US")}%`;
}
