"use client";
import { CheckCircle2, Loader2, Plus, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addCompany, testAccess } from "@/app/actions/companies";
import { CopyButton } from "@/components/app/copy-button";
import { ErrorBox } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/content/ar";
import type { ErrorInfo } from "@/lib/errors";

const COLORS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#d97706", "#16a34a", "#475569"];

export function AddCompany({ serviceAccount }: { serviceAccount: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [access, setAccess] = useState<null | { ok: boolean; title?: string; code?: string }>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [done, setDone] = useState<null | { id: string; tabs: number }>(null);
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<"" | "test" | "init">("");

  const reset = () => {
    setName(""); setUrl(""); setAccess(null); setError(null); setDone(null); setPhase("");
  };

  const check = () =>
    start(async () => {
      setError(null);
      setPhase("test");
      const r = await testAccess(url);
      setPhase("");
      if (!r.ok) return setError(r.error);
      setAccess(r.data.ok ? { ok: true, title: r.data.title } : { ok: false, code: r.data.code });
    });

  const init = () =>
    start(async () => {
      setError(null);
      setPhase("init");
      const r = await addCompany({ name, url, color });
      setPhase("");
      if (!r.ok) {
        // Lost/insufficient access: go back to the share step with the service account email.
        if (r.error.code === "sheet_no_access") return setAccess({ ok: false, code: "sheet_read_only" });
        return setError(r.error);
      }
      setDone({ id: r.data.id, tabs: r.data.report.createdTabs.length });
      router.refresh();
    });

  const step = done ? 3 : access?.ok ? 2 : 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus />
          {ar.companies.add}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ar.companies.addTitle}</DialogTitle>
          <DialogDescription className="flex gap-2 pt-1">
            {[ar.companies.step1, ar.companies.step2, ar.companies.step3].map((s, i) => (
              <span key={s} className={`rounded-full px-2 py-0.5 text-xs ${i + 1 <= step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i + 1}. {s}
              </span>
            ))}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
            <p className="font-medium">{ar.companies.done}</p>
            <Button className="w-full" size="lg" onClick={() => router.push(`/c/${done.id}`)}>
              {ar.companies.openCompany}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cname">{ar.companies.name}</Label>
              <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: النور للحلول الرقمية" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="curl">{ar.companies.url}</Label>
              <Input id="curl" dir="ltr" value={url} onChange={(e) => { setUrl(e.target.value); setAccess(null); }} placeholder="https://docs.google.com/spreadsheets/d/…/edit" />
              <p className="text-xs text-muted-foreground">{ar.companies.urlHint}</p>
            </div>
            <div className="space-y-2">
              <Label>{ar.companies.color}</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={`size-7 rounded-full ring-offset-2 ${color === c ? "ring-2 ring-foreground" : ""}`} style={{ background: c }} />
                ))}
              </div>
            </div>

            {access && !access.ok && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="flex items-start gap-1.5 font-medium text-amber-900">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {access.code === "sheet_read_only" ? ar.companies.readOnly : ar.companies.shareWith}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="ltr rounded bg-white px-2 py-1 text-xs">{serviceAccount}</code>
                  <CopyButton value={serviceAccount} />
                </div>
              </div>
            )}
            {access?.ok && (
              <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="size-4" /> {ar.companies.accessOk} — <span className="ltr">{access.title}</span>
              </p>
            )}
            {error && <ErrorBox error={error} />}

            {access?.ok ? (
              <Button className="w-full" size="lg" disabled={pending || !name.trim()} onClick={init}>
                {phase === "init" ? <><Loader2 className="animate-spin" /> {ar.companies.initializing}</> : ar.companies.initialize}
              </Button>
            ) : (
              <Button className="w-full" size="lg" disabled={pending || !url.trim() || !name.trim()} onClick={check}>
                {phase === "test" ? <Loader2 className="animate-spin" /> : null}
                {ar.companies.testAccess}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
