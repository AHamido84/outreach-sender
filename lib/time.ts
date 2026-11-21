// Timezone helpers (Intl only, no dependencies) and the send window / pacing math.

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const AR_DAYS: Record<string, Weekday> = {
  الأحد: "Sun", الاحد: "Sun", الإثنين: "Mon", الاثنين: "Mon", الثلاثاء: "Tue", الأربعاء: "Wed", الاربعاء: "Wed",
  الخميس: "Thu", الجمعة: "Fri", السبت: "Sat",
};

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function safeTz(tz: string | undefined): string {
  return tz && isValidTz(tz.trim()) ? tz.trim() : "UTC";
}

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: Weekday };

export function zonedParts(date: Date, tz: string): ZonedParts {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(date)) p[x.type] = x.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    minute: Number(p.minute),
    weekday: p.weekday as Weekday,
  };
}

/** YYYY-MM-DD of the date in the timezone. */
export function dayKey(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDate(v: string | undefined | null): Date | null {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  const d = new Date(s.includes("T") || s.includes("Z") ? s : s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

export function parseDays(v: string | undefined): Weekday[] {
  if (!v) return [];
  const out: Weekday[] = [];
  for (const raw of v.split(/[,،;\s]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const en = WEEKDAYS.find((d) => d.toLowerCase() === t.slice(0, 3).toLowerCase());
    const d = en || AR_DAYS[t];
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

export type SendWindow = { days: Weekday[]; start: number; end: number; tz: string };

export function windowMinutes(w: SendWindow): number {
  return Math.max(0, (w.end - w.start) * 60);
}

export function inWindow(now: Date, w: SendWindow): boolean {
  const p = zonedParts(now, w.tz);
  if (!w.days.includes(p.weekday)) return false;
  const m = p.hour * 60 + p.minute;
  return m >= w.start * 60 && m < w.end * 60;
}

/** Minutes elapsed since today's window opened (only meaningful inside the window). */
export function minutesIntoWindow(now: Date, w: SendWindow): number {
  const p = zonedParts(now, w.tz);
  return p.hour * 60 + p.minute - w.start * 60;
}

/** Next time the window is open (now if already inside), scanning in 5-minute steps up to 8 days. */
export function nextWindowOpen(now: Date, w: SendWindow): Date | null {
  if (!w.days.length || windowMinutes(w) <= 0) return null;
  if (inWindow(now, w)) return now;
  const step = 5 * 60_000;
  let t = Math.ceil(now.getTime() / step) * step;
  for (let i = 0; i < (8 * 24 * 60) / 5; i++, t += step) {
    if (inWindow(new Date(t), w)) return new Date(t);
  }
  return null;
}

/**
 * Pacing: spread the daily limit evenly across the window.
 * Expected sends by now = ceil(limit × (minutesIntoWindow+1) / windowMinutes); send the gap, capped by per-run and remaining.
 */
export function pacedAllowance(opts: { now: Date; w: SendWindow; dailyLimit: number; sentToday: number; perRun: number }): number {
  const { now, w, dailyLimit, sentToday, perRun } = opts;
  if (!inWindow(now, w)) return 0;
  const total = windowMinutes(w);
  const remaining = Math.max(0, dailyLimit - sentToday);
  if (!total || !remaining) return 0;
  const elapsed = Math.min(total, Math.max(0, minutesIntoWindow(now, w)) + 1);
  const expected = Math.min(dailyLimit, Math.ceil((dailyLimit * elapsed) / total));
  return Math.max(0, Math.min(expected - sentToday, perRun, remaining));
}

/** Minutes between emails at an even pace. */
export function paceIntervalMinutes(w: SendWindow, dailyLimit: number): number {
  return dailyLimit > 0 ? windowMinutes(w) / dailyLimit : 0;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400_000);
}

export function formatInTz(d: Date | null, tz: string, withTime = true): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    timeZone: safeTz(tz),
    year: "numeric",
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
