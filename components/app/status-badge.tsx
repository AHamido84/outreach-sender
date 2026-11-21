import { statusLabel, ar } from "@/content/ar";
import { cn } from "@/lib/utils";

const COLORS: Record<string, string> = {
  New: "bg-slate-100 text-slate-700 ring-slate-200",
  Ready: "bg-sky-50 text-sky-700 ring-sky-200",
  Sent: "bg-teal-50 text-teal-700 ring-teal-200",
  "Follow-up": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Replied: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Bounced: "bg-rose-50 text-rose-700 ring-rose-200",
  Unsubscribed: "bg-amber-50 text-amber-800 ring-amber-200",
  Completed: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  Invalid: "bg-red-50 text-red-700 ring-red-200",
  Duplicate: "bg-orange-50 text-orange-700 ring-orange-200",
  Failed: "bg-rose-50 text-rose-700 ring-rose-200",
  Skipped: "bg-amber-50 text-amber-800 ring-amber-200",
  Preview: "bg-slate-100 text-slate-700 ring-slate-200",
  Pending: "bg-sky-50 text-sky-700 ring-sky-200",
  Running: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  Synced: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export function Pill({ tone, children, className }: { tone: string; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", COLORS[tone] || COLORS.New, className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status || "New";
  const tone = /^Follow-up/.test(s) ? "Follow-up" : s;
  return <Pill tone={tone}>{statusLabel(s)}</Pill>;
}

export function ResultBadge({ result }: { result: string }) {
  return <Pill tone={result}>{ar.result[result] || result}</Pill>;
}

export function ScheduleBadge({ status }: { status: string }) {
  return <Pill tone={status}>{ar.scheduleStatus[status] || status}</Pill>;
}

export function MondayBadge({ status }: { status: string }) {
  if (!status || status === "—") return <span className="text-muted-foreground">—</span>;
  if (status === "Synced") return <Pill tone="Synced">{ar.contacts.mondayStatus.Synced}</Pill>;
  return (
    <Pill tone="Failed" className="max-w-40 truncate">
      <span title={status}>{ar.contacts.mondayStatus.Failed}</span>
    </Pill>
  );
}
