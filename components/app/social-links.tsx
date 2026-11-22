"use client";
import { Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ar } from "@/content/ar";
import { NETWORKS, socialRowHtml } from "@/lib/social";

export function SocialLinks({ baseUrl, onInsert }: { baseUrl?: string; onInsert: (html: string) => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [size, setSize] = useState(28);
  const base = (baseUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const filled = NETWORKS.filter((n) => values[n.id]?.trim());
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm"><Share2 />{ar.social.button}</Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[70dvh] w-[22rem] space-y-3 overflow-y-auto" align="start">
        <p className="text-xs text-muted-foreground">{ar.social.hint}</p>
        <div className="space-y-2">
          {NETWORKS.map((n) => (
            <div key={n.id} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/social/${n.id}.png`} alt="" width={24} height={24} className="shrink-0" />
              <Input dir="ltr" className="h-8 text-xs" aria-label={n.label} placeholder={n.ph} value={values[n.id] || ""} onChange={(e) => setValues({ ...values, [n.id]: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          {ar.social.size}
          <select className="h-8 rounded-lg border bg-background px-2 text-sm" value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[20, 24, 28, 32, 40].map((s) => <option key={s} value={s}>{s}px</option>)}
          </select>
        </div>
        {filled.length > 0 && (
          <div className="flex flex-wrap gap-2 rounded-lg bg-muted/50 p-2">
            {filled.map((n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n.id} src={`/social/${n.id}.png`} alt={n.label} width={size} height={size} />
            ))}
          </div>
        )}
        <Button type="button" size="sm" disabled={!filled.length} onClick={() => { onInsert(socialRowHtml(base, values, size)); setOpen(false); }}>
          {ar.social.insert}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
