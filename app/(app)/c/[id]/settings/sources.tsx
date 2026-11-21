"use client";
import { CheckCircle2, Info, Loader2, PlugZap, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { disconnectSource, testSource } from "@/app/actions/sources";
import { Section } from "@/components/app/bits";
import { Confirm } from "@/components/app/confirm";
import { CopyButton } from "@/components/app/copy-button";
import { ErrorBox, errorMessage } from "@/components/app/error-box";
import { KvForm, type FieldDef } from "@/components/app/kv-form";
import { Button } from "@/components/ui/button";
import { ar } from "@/content/ar";
import type { ErrorInfo } from "@/lib/errors";
import type { Provider } from "@/lib/sources/types";

type Mask = { set: boolean; last4: string };

const OPTIONS: Record<Provider, FieldDef[]> = {
  apollo: [{ key: "Apollo Reveal Personal Emails", type: "yesno", span: 2 }],
  hunter: [
    { key: "Hunter Email Type", type: "select", options: Object.entries(ar.sources.emailTypes) },
    { key: "Hunter Min Confidence", type: "number" },
  ],
  outscraper: [
    { key: "Outscraper Language", ltr: true }, { key: "Outscraper Region", ltr: true },
    { key: "Outscraper Find Emails", type: "yesno", span: 2 },
  ],
};
const KEYS: Record<Provider, string> = { apollo: "Apollo API Key", hunter: "Hunter API Key", outscraper: "Outscraper API Key" };

function ProviderCard({ id, p, mask, values }: { id: string; p: Provider; mask: Mask; values: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<null | { ok: true; info: string } | { ok: false; error: ErrorInfo }>(null);
  const meta = ar.sources.providers[p];
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          {meta.name}
          <span className={`rounded-full px-2 py-0.5 text-xs ${mask.set ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
            {mask.set ? ar.sources.connected : ar.sources.notConnected}
          </span>
        </span>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">{meta.desc}</p>
      <KvForm id={id} tab="Sources" values={values} fields={[{ key: KEYS[p], type: "password", secret: mask, span: 2 }, ...OPTIONS[p]]} />
      <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />{ar.sources.getKey} {meta.keyHelp}
      </p>
      {mask.set && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
          <Button variant="outline" disabled={pending} onClick={() => start(async () => {
            const r = await testSource(id, p);
            setRes(r.ok ? { ok: true, info: r.data.info } : r);
          })}>
            {pending ? <Loader2 className="animate-spin" /> : <PlugZap />}{ar.sources.test}
          </Button>
          <Confirm
            trigger={<Button variant="ghost" disabled={pending}><Unplug />{ar.sources.disconnect}</Button>}
            description={ar.sources.disconnectConfirm}
            destructive
            onConfirm={() => start(async () => {
              const r = await disconnectSource(id, p);
              if (!r.ok) return void toast.error(errorMessage(r.error));
              setRes(null);
              router.refresh();
            })}
          />
        </div>
      )}
      {res?.ok && <p className="mt-2 flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{ar.sources.testOk} <span className="ltr text-xs text-muted-foreground">{res.info}</span></p>}
      {res && !res.ok && <ErrorBox error={res.error} className="mt-2" />}
    </Section>
  );
}

export function SourcesTab({ id, values, keys, serviceAccount }: { id: string; values: Record<string, string>; keys: Record<Provider, Mask>; serviceAccount: string }) {
  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{ar.sources.settingsHint}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["apollo", "hunter", "outscraper"] as Provider[]).map((p) => <ProviderCard key={p} id={id} p={p} mask={keys[p]} values={values} />)}
        <Section title={ar.sources.providers.sheet.name}>
          <p className="mb-3 text-sm text-muted-foreground">{ar.sources.providers.sheet.desc}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="ltr rounded bg-muted px-2 py-1 text-xs">{serviceAccount}</code>
            <CopyButton value={serviceAccount} />
          </div>
        </Section>
      </div>
      <Section title={ar.sources.defaults}>
        <KvForm
          id={id}
          tab="Sources"
          values={values}
          fields={[
            { key: "Default Tags", hint: "vip, apollo-2026" },
            { key: "Default Status", type: "select", options: [["Ready", ar.status.Ready], ["New", ar.status.New]] },
          ]}
        />
      </Section>
    </div>
  );
}
