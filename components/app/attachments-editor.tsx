"use client";
import { CheckCircle2, Loader2, Paperclip, Plus, SearchCheck, Trash2, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { checkAttachments } from "@/app/actions/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ar, errorText } from "@/content/ar";
import { formatAttachments, parseAttachments, type AttachmentRef } from "@/lib/attachments";

type Check = Awaited<ReturnType<typeof checkAttachments>>;

function size(n: number) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function AttachmentsEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [rows, setRows] = useState<AttachmentRef[]>(() => {
    const p = parseAttachments(value);
    return p.length ? p : [];
  });
  const [result, setResult] = useState<Check | null>(null);
  const [pending, start] = useTransition();
  const update = (next: AttachmentRef[]) => {
    setRows(next);
    setResult(null);
    onChange(formatAttachments(next));
  };
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Paperclip className="size-4" />{ar.attachments.title}</p>
        <div className="flex gap-1">
          {rows.length > 0 && (
            <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={() => start(async () => setResult(await checkAttachments(formatAttachments(rows))))}>
              {pending ? <Loader2 className="animate-spin" /> : <SearchCheck />}{ar.attachments.check}
            </Button>
          )}
          <Button type="button" size="xs" variant="outline" onClick={() => update([...rows, { name: "", url: "" }])}><Plus />{ar.attachments.add}</Button>
        </div>
      </div>
      {!rows.length && <p className="text-xs text-muted-foreground">{ar.attachments.empty}</p>}
      {rows.map((r, i) => {
        const chk = result?.ok ? result.data.find((c) => c.url === r.url.trim()) : undefined;
        return (
          <div key={i} className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Input className="w-40" value={r.name || ""} placeholder={ar.attachments.namePh} onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input className="min-w-56 flex-1" dir="ltr" value={r.url} placeholder="https://drive.google.com/file/d/…" onChange={(e) => update(rows.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
              <Button type="button" size="icon-sm" variant="ghost" aria-label={ar.common.delete} onClick={() => update(rows.filter((_, j) => j !== i))}><Trash2 /></Button>
            </div>
            {chk && (chk.ok ? (
              <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-3.5" />{chk.filename} · {size(chk.size)}</p>
            ) : (
              <p className="flex items-center gap-1 text-xs text-rose-600"><XCircle className="size-3.5" />{errorText(chk.error.code)}</p>
            ))}
          </div>
        );
      })}
      {result && !result.ok && <p className="text-xs text-rose-600">{errorText(result.error.code)}</p>}
      <p className="text-xs leading-relaxed text-muted-foreground">{ar.attachments.hint}</p>
    </div>
  );
}
