"use client";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { appendImport, getSavedMapping, previewImport } from "@/app/actions/contacts";
import { ErrorBox } from "@/components/app/error-box";
import { Kpi, Section } from "@/components/app/bits";
import { Pill } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ar } from "@/content/ar";
import type { ErrorInfo } from "@/lib/errors";
import type { ImportCheck } from "@/lib/emails";
import { IMPORT_FIELDS, suggestMapping, type ImportField } from "@/lib/import-map";

type Parsed = { headers: string[]; rows: string[][] };

function fromMatrix(m: unknown[][]): Parsed {
  const clean = m.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())));
  const nonEmpty = clean.filter((r) => r.some((c) => c));
  const [h = [], ...rows] = nonEmpty;
  const headers = h.map((x, i) => x || `Column ${i + 1}`);
  return { headers, rows };
}

const TONE: Record<string, string> = { valid: "Done", invalid: "Invalid", duplicate: "Duplicate", dnc: "Unsubscribed" };

export function ImportWizard({ id }: { id: string }) {
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [paste, setPaste] = useState("");
  const [source, setSource] = useState("");
  const [mapping, setMapping] = useState<Record<string, ImportField | "">>({});
  const [remembered, setRemembered] = useState(false);
  const [preview, setPreview] = useState<{ counts: Record<string, number>; checks: ImportCheck[] } | null>(null);
  const [initialStatus, setInitialStatus] = useState<"Ready" | "New">("Ready");
  const [includeBad, setIncludeBad] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [done, setDone] = useState<null | { added: number; mondayCreated: number }>(null);
  const [pending, start] = useTransition();

  const loadParsed = (p: Parsed) =>
    start(async () => {
      if (p.rows.length > 5000) return void toast.error(ar.import.tooMany);
      setParsed(p);
      let m = suggestMapping(p.headers);
      setRemembered(false);
      if (source.trim()) {
        const saved = await getSavedMapping(id, source);
        if (saved.ok && saved.data) {
          m = Object.fromEntries(p.headers.map((h) => [h, (saved.data![h] as ImportField) ?? m[h]]));
          setRemembered(true);
        }
      }
      setMapping(m);
      setStep(2);
    });

  const onFile = async (f: File) => {
    setError(null);
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/universal");
        loadParsed(fromMatrix((await readSheet(f)) as unknown[][]));
      } else {
        const text = await f.text();
        const res = Papa.parse<string[]>(text, { skipEmptyLines: true });
        loadParsed(fromMatrix(res.data));
      }
      if (!source) setSource(f.name.replace(/\.[^.]+$/, ""));
    } catch (e) {
      setError({ code: "invalid_input", detail: (e as Error).message });
    }
  };

  const onPaste = () => {
    const res = Papa.parse<string[]>(paste.trim(), { skipEmptyLines: true, delimiter: paste.includes("\t") ? "\t" : "" });
    loadParsed(fromMatrix(res.data));
  };

  const mappedRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.rows.map((r) => {
      const o: Partial<Record<ImportField, string>> = {};
      parsed.headers.forEach((h, i) => {
        const f = mapping[h];
        if (f) o[f] = o[f] ? `${o[f]} ${r[i] || ""}`.trim() : r[i] || "";
      });
      return o;
    });
  }, [parsed, mapping]);

  const hasEmail = Object.values(mapping).includes("Email");

  const doPreview = () =>
    start(async () => {
      setError(null);
      const r = await previewImport(id, mappedRows);
      if (!r.ok) return setError(r.error);
      setPreview(r.data);
      setStep(3);
    });

  const doAppend = () =>
    start(async () => {
      setError(null);
      const r = await appendImport(id, { rows: mappedRows, source, mapping: mapping as Record<string, string>, initialStatus, includeBad });
      if (!r.ok) return setError(r.error);
      setDone({ added: r.data.added, mondayCreated: r.data.mondayCreated });
      setStep(4);
      toast.success(ar.import.done(r.data.added));
    });

  const steps = [ar.import.step1, ar.import.step2, ar.import.step3, ar.import.step4];
  const appendCount = preview ? preview.counts.valid + (includeBad ? preview.counts.invalid + preview.counts.duplicate : 0) : 0;

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2 text-xs">
        {steps.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i + 1 === step ? "bg-primary text-primary-foreground" : i + 1 < step ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>
      {error && <ErrorBox error={error} />}

      {step === 1 && (
        <Section>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="src">{ar.import.source}</Label>
              <Input id="src" value={source} onChange={(e) => setSource(e.target.value)} placeholder="LinkedIn" className="max-w-sm" />
              <p className="text-xs text-muted-foreground">{ar.import.sourceHint}</p>
            </div>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center hover:bg-muted/40">
              <FileSpreadsheet className="size-8 text-primary" />
              <span className="font-medium">{ar.import.upload}</span>
              <span className="text-xs text-muted-foreground">.csv · .xlsx</span>
              <input type="file" accept=".csv,.xlsx,.txt,.tsv" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
            <div className="space-y-1.5">
              <Label htmlFor="paste">{ar.import.paste}</Label>
              <Textarea id="paste" dir="ltr" rows={6} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"Company\tName\tEmail\tWebsite\nAcme\tJohn\tjohn@acme.com\tacme.com"} />
              <Button variant="outline" disabled={!paste.trim() || pending} onClick={onPaste}>{ar.import.parse}</Button>
            </div>
          </div>
        </Section>
      )}

      {step === 2 && parsed && (
        <Section title={ar.import.step2} actions={<span className="text-xs text-muted-foreground">{ar.import.rowsRead(parsed.rows.length)}</span>}>
          {remembered && <p className="mb-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">{ar.import.rememberedMapping}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-start"><th>Column</th><th>{ar.import.mapTo}</th><th>{ar.import.sample}</th></tr>
              </thead>
              <tbody className="divide-y">
                {parsed.headers.map((h, i) => (
                  <tr key={h + i} className="[&>td]:px-2 [&>td]:py-1.5">
                    <td className="font-medium">{h}</td>
                    <td>
                      <select className="h-8 w-44 rounded-lg border bg-background px-2" value={mapping[h] || ""} onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as ImportField })}>
                        <option value="">— {ar.import.ignore} —</option>
                        {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{ar.fields[f] || f}</option>)}
                      </select>
                    </td>
                    <td className="max-w-64 truncate text-xs text-muted-foreground">{parsed.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!hasEmail && <p className="mt-3 text-sm text-rose-600">{ar.import.needEmail}</p>}
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>{ar.common.back}</Button>
            <Button disabled={!hasEmail || pending} onClick={doPreview}>{pending && <Loader2 className="animate-spin" />}{ar.common.next}</Button>
          </div>
        </Section>
      )}

      {step === 3 && preview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label={ar.import.valid} value={preview.counts.valid} tone="good" />
            <Kpi label={ar.import.invalid} value={preview.counts.invalid} tone={preview.counts.invalid ? "bad" : undefined} />
            <Kpi label={ar.import.duplicate} value={preview.counts.duplicate} tone={preview.counts.duplicate ? "warn" : undefined} />
            <Kpi label={ar.import.dnc} value={preview.counts.dnc} />
          </div>
          <Section title={ar.import.step3}>
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                  <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-start"><th>#</th><th>{ar.fields.Company}</th><th>{ar.fields["Contact Name"]}</th><th>{ar.fields.Email}</th><th>{ar.fields.Status}</th></tr>
                </thead>
                <tbody className="divide-y">
                  {mappedRows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="[&>td]:px-2 [&>td]:py-1.5">
                      <td className="text-xs text-muted-foreground">{i + 1}</td>
                      <td>{r.Company}</td>
                      <td>{r["Contact Name"]}</td>
                      <td className="font-mono text-xs">{preview.checks[i].email}</td>
                      <td>
                        <Pill tone={TONE[preview.checks[i].status]}>{ar.import[preview.checks[i].status as "valid"]}</Pill>
                        {preview.checks[i].reason && <span className="ms-1 text-xs text-muted-foreground">{ar.import.reasons[preview.checks[i].reason!]}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                {ar.import.initialStatus}
                <select className="h-8 rounded-lg border bg-background px-2" value={initialStatus} onChange={(e) => setInitialStatus(e.target.value as "Ready")}>
                  <option value="Ready">{ar.status.Ready}</option>
                  <option value="New">{ar.status.New}</option>
                </select>
              </label>
              <label className="flex items-center gap-2"><Checkbox checked={includeBad} onCheckedChange={(v) => setIncludeBad(!!v)} />{ar.import.includeBad}</label>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>{ar.common.back}</Button>
              <Button disabled={!appendCount || pending} onClick={doAppend}>{pending && <Loader2 className="animate-spin" />}{ar.import.appendBtn(appendCount)}</Button>
            </div>
          </Section>
        </>
      )}

      {step === 4 && done && (
        <Section>
          <div className="space-y-3 py-6 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
            <p className="text-lg font-semibold">{ar.import.done(done.added)}</p>
            {!!done.mondayCreated && <p className="text-sm text-muted-foreground">monday: {done.mondayCreated}</p>}
            <Button asChild><Link href={`/c/${id}/contacts`}>{ar.contacts.title}<ArrowLeft /></Link></Button>
          </div>
        </Section>
      )}
    </div>
  );
}

