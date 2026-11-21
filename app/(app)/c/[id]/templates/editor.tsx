"use client";
import { AlertTriangle, CheckCircle2, Copy, Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteTemplate, previewTemplate, saveTemplate, sendTemplateTest, type TemplateDraft } from "@/app/actions/templates";
import { Confirm } from "@/components/app/confirm";
import { errorMessage } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RichEditor, type RichEditorHandle } from "@/components/app/rich-editor";
import { ar } from "@/content/ar";
import type { Template } from "@/lib/selection";
import { cn } from "@/lib/utils";

type Lang = "AR" | "EN";
const blank = (language: Lang, step: number, version = "A"): TemplateDraft => ({
  name: step ? `${language === "AR" ? "متابعة" : "Follow-up"} ${step}` : language === "AR" ? "أول رسالة" : "First email",
  language, step, delayDays: step ? 3 : 0, subject: "", body: "", version, active: true,
});

export function TemplatesEditor(props: {
  id: string;
  templates: Template[];
  contacts: { id: string; label: string; language: string }[];
  builtins: string[];
  contactVars: string[];
}) {
  const { id, templates, contacts } = props;
  const router = useRouter();
  const [lang, setLang] = useState<Lang>(() => (templates.some((t) => t.language === "AR") || !templates.length ? "AR" : "EN"));
  const list = useMemo(() => templates.filter((t) => t.language === lang).sort((a, b) => a.step - b.step || a.version.localeCompare(b.version)), [templates, lang]);
  const [draft, setDraft] = useState<TemplateDraft>(() => (list[0] ? { ...list[0] } : blank(lang, 0)));
  const [dirty, setDirty] = useState(false);
  const [contactId, setContactId] = useState<string>("");
  const [preview, setPreview] = useState<null | { subject: string; html: string; missing: string[]; contactId: string }>(null);
  const [pending, start] = useTransition();
  const [testing, startTest] = useTransition();
  const bodyRef = useRef<RichEditorHandle>(null);
  const [editorKey, setEditorKey] = useState(0);
  const subjRef = useRef<HTMLInputElement>(null);
  const lastFocus = useRef<"subject" | "body">("body");

  const steps = [...new Set(list.map((t) => t.step))].sort((a, b) => a - b);

  const select = (t: TemplateDraft) => {
    setDraft({ ...t });
    setDirty(false);
    setEditorKey((k) => k + 1); // remount the rich editor with the new body
  };

  const change = (patch: Partial<TemplateDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  };

  // Live preview (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await previewTemplate(id, draft, contactId || undefined);
      if (r.ok) setPreview(r.data);
    }, 350);
    return () => clearTimeout(t);
  }, [id, draft, contactId]);

  const insertVar = (v: string) => {
    const token = `{${v}}`;
    if (lastFocus.current === "body" || draft.step > 0) {
      bodyRef.current?.insertText(token);
      return;
    }
    const el = subjRef.current;
    const cur = draft.subject;
    const pos = el?.selectionStart ?? cur.length;
    change({ subject: cur.slice(0, pos) + token + cur.slice(el?.selectionEnd ?? pos) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos + token.length, pos + token.length);
    });
  };

  const save = () =>
    start(async () => {
      const r = await saveTemplate(id, draft);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      setDraft((d) => ({ ...d, id: r.data.id }));
      setDirty(false);
      toast.success(ar.templates.saved);
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      if (!draft.id) return;
      const r = await deleteTemplate(id, draft.id);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      const rest = list.filter((t) => t.id !== draft.id);
      select(rest[0] ? { ...rest[0] } : blank(lang, 0));
      router.refresh();
    });

  const test = () =>
    startTest(async () => {
      const r = await sendTemplateTest(id, draft, contactId || undefined);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.templates.testSent(r.data.to));
    });

  const isRtl = draft.language === "AR";
  const nextStep = (steps.length ? Math.max(...steps) : -1) + 1;

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      {/* Sequence */}
      <aside className="space-y-3">
        <div className="flex rounded-lg border p-0.5">
          {(["AR", "EN"] as Lang[]).map((l) => (
            <button key={l} type="button" onClick={() => { setLang(l); const f = templates.find((t) => t.language === l); select(f ? { ...f } : blank(l, 0)); }}
              className={cn("flex-1 rounded-md py-1.5 text-sm", lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
              {l === "AR" ? "عربي" : "English"}
            </button>
          ))}
        </div>
        <ol className="relative space-y-3 border-s-2 border-dashed border-primary/30 ps-4">
          {steps.map((st) => (
            <li key={st} className="relative">
              <span className="absolute -start-[1.42rem] top-2 size-3 rounded-full bg-primary ring-4 ring-background" />
              <p className="mb-1 text-xs font-semibold text-muted-foreground">
                {st === 0 ? ar.templates.step0 : ar.templates.followup(st)}
                {st > 0 && <span className="font-normal"> · +{list.find((t) => t.step === st)?.delayDays ?? 0} يوم</span>}
              </p>
              <div className="space-y-1">
                {list.filter((t) => t.step === st).map((t) => (
                  <button key={t.id} type="button" onClick={() => select({ ...t })}
                    className={cn("w-full rounded-lg border bg-card p-2 text-start text-sm transition hover:border-primary", draft.id === t.id && "border-primary ring-1 ring-primary")}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{t.name || t.id}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="rounded bg-muted px-1.5 text-xs">{t.version}</span>
                        <span className={cn("size-2 rounded-full", t.active ? "bg-emerald-500" : "bg-zinc-300")} title={t.active ? ar.templates.active : ""} />
                      </span>
                    </div>
                    {st === 0 && <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.subject}</p>}
                  </button>
                ))}
              </div>
              {st === 0 && (
                <Button variant="ghost" size="xs" className="mt-1" onClick={() => {
                  const used = list.filter((t) => t.step === 0).map((t) => t.version);
                  const v = ["A", "B", "C", "D"].find((x) => !used.includes(x)) || "B";
                  const base = list.find((t) => t.step === 0);
                  select({ ...(base ? { ...base, id: undefined, name: `${base.name} (${v})` } : blank(lang, 0)), version: v });
                  setDirty(true);
                }}>
                  <Copy />{ar.templates.addVersion}
                </Button>
              )}
            </li>
          ))}
          {!steps.length && <li className="text-sm text-muted-foreground">{ar.templates.empty}</li>}
        </ol>
        <Button variant="outline" className="w-full" onClick={() => { select(blank(lang, nextStep)); setDirty(true); }}>
          <Plus />{nextStep === 0 ? ar.templates.new : ar.templates.addStep}
        </Button>
      </aside>

      {/* Editor + preview */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {draft.step === 0 ? ar.templates.step0 : ar.templates.followup(draft.step)}
              <span className="ms-2 font-mono text-xs text-muted-foreground">{draft.id || ar.templates.new}</span>
            </h2>
            {dirty && <span className="text-xs text-amber-700">● {ar.templates.unsaved}</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="tn">{ar.templates.name}</Label>
              <Input id="tn" value={draft.name} onChange={(e) => change({ name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="tv">{ar.templates.version}</Label>
              <select id="tv" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={draft.version} onChange={(e) => change({ version: e.target.value })}>
                {["A", "B", "C", "D"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ta">{ar.templates.active}</Label>
              <div className="flex h-8 items-center"><Switch id="ta" checked={draft.active} onCheckedChange={(v) => change({ active: v })} /></div>
            </div>
            {draft.step > 0 && (
              <div className="col-span-2 space-y-1">
                <Label htmlFor="td">{ar.templates.delayDays}</Label>
                <Input id="td" type="number" min={0} value={draft.delayDays} onChange={(e) => change({ delayDays: Number(e.target.value) })} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ts">{ar.templates.subject}</Label>
            {draft.step > 0 ? (
              <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{ar.templates.followupSubject}</p>
            ) : (
              <Input id="ts" ref={subjRef} dir={isRtl ? "rtl" : "ltr"} value={draft.subject} onFocus={() => (lastFocus.current = "subject")} onChange={(e) => change({ subject: e.target.value })} />
            )}
          </div>
          <div className="space-y-1">
            <Label>{ar.templates.body}</Label>
            <RichEditor
              key={editorKey}
              ref={bodyRef}
              dir={isRtl ? "rtl" : "ltr"}
              value={draft.body}
              onFocus={() => (lastFocus.current = "body")}
              onChange={(html) => change({ body: html })}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">{ar.templates.variables}</p>
            <div className="flex flex-wrap gap-1">
              {props.builtins.map((v) => (
                <button key={v} type="button" onClick={() => insertVar(v)} className="ltr rounded-md border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-xs text-primary hover:bg-primary/10">{`{${v}}`}</button>
              ))}
              {props.contactVars.map((v) => (
                <button key={v} type="button" onClick={() => insertVar(v)} className="ltr rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted">{`{${v}}`}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={save} disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Save />}{ar.common.save}</Button>
            <Button variant="outline" onClick={test} disabled={testing}>{testing ? <Loader2 className="animate-spin" /> : <Send />}{ar.templates.sendTest}</Button>
            {draft.id && (
              <Confirm trigger={<Button variant="destructive" className="ms-auto"><Trash2 />{ar.common.delete}</Button>} description={ar.templates.deleteConfirm} destructive confirmLabel={ar.common.delete} onConfirm={remove} />
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{ar.templates.preview}</h2>
            <select aria-label={ar.templates.previewWith} className="h-8 max-w-64 rounded-lg border bg-background px-2 text-xs" value={contactId || preview?.contactId || ""} onChange={(e) => setContactId(e.target.value)}>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {preview && (
            <>
              {preview.missing.length ? (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>{ar.templates.missingVars} <span className="ltr font-mono">{preview.missing.map((m) => `{${m}}`).join(" ")}</span></span>
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 className="size-4" />{ar.templates.noMissing}</p>
              )}
              <div className="overflow-hidden rounded-lg border">
                <div className="border-b bg-muted/40 px-3 py-2 text-sm" dir={isRtl ? "rtl" : "ltr"}>
                  <span className="text-muted-foreground">{ar.templates.subject}: </span>
                  <span className="font-medium">{preview.subject}</span>
                </div>
                <iframe title="preview" className="h-[420px] w-full bg-white" sandbox="" srcDoc={preview.html} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
