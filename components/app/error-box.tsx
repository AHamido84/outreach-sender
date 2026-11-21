"use client";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { errorText, ar } from "@/content/ar";
import type { ErrorInfo } from "@/lib/errors";
import { cn } from "@/lib/utils";

export function ErrorBox({ error, title, className }: { error: ErrorInfo; title?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div role="alert" className={cn("rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm", className)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          {title && <p className="font-semibold">{title}</p>}
          <p className="text-destructive">{errorText(error.code)}</p>
          {error.detail && error.detail !== error.code && (
            <>
              <button type="button" onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {ar.common.details}
                <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
              </button>
              {open && <pre className="ltr mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-xs text-muted-foreground">{error.code}: {error.detail}</pre>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Toast-friendly message for an action error. */
export function errorMessage(error: ErrorInfo): string {
  return errorText(error.code);
}
