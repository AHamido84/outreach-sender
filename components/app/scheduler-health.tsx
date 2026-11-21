"use client";
import { Activity } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ar } from "@/content/ar";
import { fmtRelative } from "@/lib/format";
import type { SchedulerHealth } from "@/lib/views";

export function SchedulerHealthBadge({ health }: { health: SchedulerHealth }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs ${health.stale ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}
        >
          <Activity className="size-3.5" />
          {ar.auto.scheduler}: {health.stale ? ar.auto.cronStale : ar.auto.cronOk}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="end">
        <p className="font-semibold">{ar.auto.scheduler}</p>
        <p className="mt-1 text-muted-foreground">
          {ar.auto.lastCron}: {health.lastCronAt ? fmtRelative(health.lastCronAt) : "—"}
        </p>
        {health.stale && (
          <>
            <p className="mt-2 font-medium text-rose-700">{health.lastCronAt ? ar.warnings.scheduler_stale as string : ar.warnings.scheduler_never as string}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ar.auto.cronHelpText}</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
