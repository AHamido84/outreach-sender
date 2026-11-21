"use client";
import { CheckCircle2, Columns3, Download, FlaskConical, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createMissingMondayColumns, loadMondayBoard, saveMondayMapping, testMonday } from "@/app/actions/settings";
import { Section } from "@/components/app/bits";
import { ErrorBox, errorMessage } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/content/ar";
import type { MondayBoard } from "@/lib/adapters/types";
import type { ErrorInfo } from "@/lib/errors";
import { MONDAY_FIELDS } from "@/lib/schema";

const FIELD_LABELS: Record<string, string> = {
  email: "الإيميل", status: "الحالة", step: "الخطوة", "last sent": "آخر إرسال", "next send": "الإرسال القادم", company: "الشركة",
  person: "الشخص", phone: "الهاتف", website: "الموقع", city: "المدينة", industry: "المجال", source: "المصدر", notes: "ملاحظات",
};

export function MondayTab(props: {
  id: string; token: { set: boolean; last4: string }; boardId: string; groupId: string; createOn: string; updateOnReply: boolean;
  mapping: Record<string, string>; failed: number;
}) {
  const { id } = props;
  const router = useRouter();
  const [token, setToken] = useState("");
  const [board, setBoard] = useState(props.boardId);
  const [loaded, setLoaded] = useState<MondayBoard | null>(null);
  const [groupId, setGroupId] = useState(props.groupId);
  const [createOn, setCreateOn] = useState(props.createOn);
  const [onReply, setOnReply] = useState(props.updateOnReply);
  const [mapping, setMapping] = useState<Record<string, string>>(props.mapping);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [pending, start] = useTransition();
  const [test, setTest] = useState<null | { ok: boolean; error?: ErrorInfo }>(null);

  const load = () =>
    start(async () => {
      setError(null);
      const r = await loadMondayBoard(id, { token, board });
      if (!r.ok) return setError(r.error);
      setLoaded(r.data.board);
      setBoard(r.data.board.id);
      setToken("");
      toast.success(ar.settings.boardLoaded(r.data.board.name));
      router.refresh();
    });

  const save = () =>
    start(async () => {
      const r = await saveMondayMapping(id, { groupId, createOn, updateOnReply: onReply, mapping });
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.settings.fieldsSaved);
      router.refresh();
    });

  const missing = MONDAY_FIELDS.filter((f) => !mapping[f]);
  const createCols = () =>
    start(async () => {
      await saveMondayMapping(id, { groupId, createOn, updateOnReply: onReply, mapping });
      const r = await createMissingMondayColumns(id, missing);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      setMapping({ ...mapping, ...r.data.created });
      setLoaded(r.data.board);
      toast.success(`${Object.keys(r.data.created).length} ✓`);
      router.refresh();
    });

  const runTest = () =>
    start(async () => {
      const r = await testMonday(id);
      setTest(r.ok ? { ok: true } : { ok: false, error: r.error });
    });

  return (
    <div className="space-y-4">
      <Section>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="mt">{ar.settings.mondayToken}</Label>
            <Input id="mt" type="password" dir="ltr" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)}
              placeholder={props.token.set ? `${ar.common.secretSaved} ••••${props.token.last4}` : ar.common.secretNotSet} />
            {props.token.set && <p className="text-xs text-emerald-700">{ar.common.secretSaved} ••••{props.token.last4}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="mb">{ar.settings.boardId}</Label>
            <Input id="mb" dir="ltr" value={board} onChange={(e) => setBoard(e.target.value)} placeholder="https://x.monday.com/boards/123…" />
            <p className="text-xs text-muted-foreground">&nbsp;</p>
          </div>
          <div className="pb-5">
            <Button onClick={load} disabled={pending || !board || (!token && !props.token.set)}>{pending ? <Loader2 className="animate-spin" /> : <Download />}{ar.settings.loadBoard}</Button>
          </div>
        </div>
        {error && <ErrorBox error={error} className="mt-2" />}
        {props.failed > 0 && <p className="mt-2 text-sm text-amber-700">{(ar.warnings.monday_failing as (n: string) => string)(String(props.failed))}</p>}
      </Section>

      <Section title={ar.settings.mapping} actions={loaded && <span className="text-xs text-muted-foreground">{loaded.name}</span>}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="mg">{ar.settings.groups}</Label>
            {loaded ? (
              <select id="mg" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">—</option>
                {loaded.groups.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
              </select>
            ) : (
              <Input id="mg" dir="ltr" value={groupId} onChange={(e) => setGroupId(e.target.value)} />
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="mc">{ar.fields["Create Item On"]}</Label>
            <select id="mc" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={createOn} onChange={(e) => setCreateOn(e.target.value)}>
              {Object.entries(ar.settings.createOn).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={onReply} onCheckedChange={(v) => setOnReply(!!v)} />{ar.settings.updateOnReply}</label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {MONDAY_FIELDS.map((f) => (
            <div key={f} className="flex items-center gap-2 rounded-lg border p-2">
              <span className="w-28 shrink-0 text-sm">{FIELD_LABELS[f]}</span>
              {loaded ? (
                <select className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm" value={mapping[f] || ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}>
                  <option value="">— {ar.settings.notMapped} —</option>
                  {loaded.columns.filter((c) => c.type !== "name").map((c) => <option key={c.id} value={c.id}>{c.title} ({c.type})</option>)}
                </select>
              ) : (
                <Input dir="ltr" className="flex-1" value={mapping[f] || ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })} placeholder="column id" />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending}><Save />{ar.common.save}</Button>
          {loaded && missing.length > 0 && <Button variant="outline" onClick={createCols} disabled={pending}><Columns3 />{ar.settings.createMissing} ({missing.length})</Button>}
          <Button variant="outline" onClick={runTest} disabled={pending || !props.token.set}><FlaskConical />{ar.settings.testMonday}</Button>
        </div>
        {test?.ok && <p className="mt-3 flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{ar.settings.mondayOk}</p>}
        {test && !test.ok && test.error && <ErrorBox error={test.error} className="mt-3" />}
      </Section>
    </div>
  );
}
