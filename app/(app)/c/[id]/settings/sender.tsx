"use client";
import { CheckCircle2, Info, Loader2, Mail, Plug, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deliverabilityCheck, sendTestEmail, testImap, testSmtp } from "@/app/actions/settings";
import { Section } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { KvForm } from "@/components/app/kv-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/content/ar";
import type { DnsItem } from "@/lib/dns-check";
import type { ErrorInfo } from "@/lib/errors";
import { fmtRelative } from "@/lib/format";

const PRESETS: Record<string, Record<string, string>> = {
  "Gmail / Workspace": { "SMTP Host": "smtp.gmail.com", "SMTP Port": "465", "SMTP Secure": "yes", "IMAP Host": "imap.gmail.com", "IMAP Port": "993" },
  "Outlook / 365": { "SMTP Host": "smtp.office365.com", "SMTP Port": "587", "SMTP Secure": "no", "IMAP Host": "outlook.office365.com", "IMAP Port": "993" },
  Zoho: { "SMTP Host": "smtp.zoho.com", "SMTP Port": "465", "SMTP Secure": "yes", "IMAP Host": "imap.zoho.com", "IMAP Port": "993" },
};

function TestButton({ label, okText, run, icon: Icon }: { label: string; okText: string; run: () => Promise<{ ok: true } | { ok: false; error: ErrorInfo }>; icon: typeof Plug }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<null | { ok: true } | { ok: false; error: ErrorInfo }>(null);
  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={pending} onClick={() => start(async () => setRes(await run()))}>
        {pending ? <Loader2 className="animate-spin" /> : <Icon />}{label}
      </Button>
      {res?.ok && <p className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="size-4" />{okText}</p>}
      {res && !res.ok && <ErrorBox error={res.error} />}
    </div>
  );
}

export function SenderTab({ id, values, secrets, smtpTestedAt, imapTestedAt }: {
  id: string; values: Record<string, string>; secrets: Record<string, { set: boolean; last4: string }>; smtpTestedAt: string; imapTestedAt: string;
}) {
  const router = useRouter();
  const [preset, setPreset] = useState<Record<string, string> | null>(null);
  const [selector, setSelector] = useState("google");
  const [dns, setDns] = useState<{ domain: string; items: DnsItem[] } | null>(null);
  const [dnsErr, setDnsErr] = useState<ErrorInfo | null>(null);
  const [checking, startDns] = useTransition();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <Section title={ar.settings.sections.identity}>
          <KvForm id={id} tab="Sender" values={values} fields={[{ key: "From Name" }, { key: "From Email", type: "email" }, { key: "Reply-To", type: "email" }, { key: "Unsubscribe Line", type: "textarea" }]} />
        </Section>
        <Section
          title={ar.settings.sections.smtp}
          actions={
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-muted-foreground">{ar.settings.providers}:</span>
              {Object.keys(PRESETS).map((p) => <Button key={p} size="xs" variant="outline" onClick={() => setPreset({ ...PRESETS[p] })}>{p}</Button>)}
            </div>
          }
        >
          <KvForm
            id={id}
            tab="Sender"
            values={values}
            preset={preset}
            fields={[
              { key: "SMTP Host", ltr: true }, { key: "SMTP Port", type: "number" }, { key: "SMTP Secure", type: "yesno" }, { key: "SMTP User", type: "email" },
              { key: "SMTP Password", type: "password", secret: secrets["SMTP Password"] },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-4 border-t pt-4">
            <TestButton label={ar.settings.testSmtp} okText={ar.settings.smtpOk} icon={Plug} run={async () => { const r = await testSmtp(id); router.refresh(); return r.ok ? { ok: true } : r; }} />
            <TestButton label={ar.settings.sendTestEmail} okText={ar.templates.testSent(values["Reply-To"] || values["From Email"] || "")} icon={Mail} run={async () => { const r = await sendTestEmail(id); return r.ok ? { ok: true } : r; }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{smtpTestedAt ? `✓ ${ar.settings.smtpOk} · ${fmtRelative(smtpTestedAt)}` : ar.warnings.smtp_not_tested as string}</p>
        </Section>
        <Section title={ar.settings.sections.dedup}>
          <KvForm
            id={id}
            tab="Sender"
            values={values}
            fields={[
              { key: "Allow Same Domain", type: "yesno", hint: ar.settings.sameDomainHint, span: 2 },
              { key: "Allow Resend", type: "yesno", hint: ar.settings.resendHint, span: 2 },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">{ar.settings.dedupHint}</p>
        </Section>
        <Section title={ar.settings.sections.imap}>
          <KvForm
            id={id}
            tab="Sender"
            values={values}
            preset={preset}
            fields={[
              { key: "IMAP Host", ltr: true }, { key: "IMAP Port", type: "number" }, { key: "IMAP User", type: "email", hint: "فارغ = نفس SMTP User" },
              { key: "IMAP Password", type: "password", secret: secrets["IMAP Password"], hint: "فارغ = نفس SMTP Password" },
            ]}
          />
          <div className="mt-4 border-t pt-4">
            <TestButton label={ar.settings.testImap} okText={ar.settings.imapOk} icon={Plug} run={async () => { const r = await testImap(id); return r.ok ? { ok: true } : r; }} />
            {imapTestedAt && <p className="mt-2 text-xs text-muted-foreground">✓ {fmtRelative(imapTestedAt)}</p>}
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title={ar.settings.deliverability}>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="sel">{ar.settings.dkimSelector}</Label>
              <Input id="sel" dir="ltr" value={selector} onChange={(e) => setSelector(e.target.value)} />
            </div>
            <Button variant="outline" disabled={checking} onClick={() => startDns(async () => {
              setDnsErr(null);
              const r = await deliverabilityCheck(id, selector);
              if (r.ok) setDns(r.data); else setDnsErr(r.error);
            })}>
              {checking ? <Loader2 className="animate-spin" /> : <ShieldCheck />}{ar.settings.check}
            </Button>
          </div>
          {dnsErr && <ErrorBox error={dnsErr} className="mt-3" />}
          {dns && (
            <ul className="mt-3 space-y-2">
              <li className="ltr text-xs text-muted-foreground">{dns.domain}</li>
              {dns.items.map((it) => (
                <li key={it.key} className="rounded-lg border p-2 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <span>{it.level === "ok" ? "✅" : it.level === "warn" ? "⚠️" : "❌"}</span>{ar.dns[it.key]}
                  </div>
                  {it.value !== "—" && <p className="ltr mt-0.5 truncate font-mono text-[11px] text-muted-foreground" title={it.value}>{it.value}</p>}
                  {it.fix !== "ok" && <p className="mt-1 text-xs text-muted-foreground">{ar.dns.fix[it.fix as keyof typeof ar.dns.fix]}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={<span className="flex items-center gap-1.5"><Info className="size-4 text-sky-600" />{ar.settings.gmailNote}</span>}>
          <ol className="list-decimal space-y-1.5 ps-5 text-sm leading-relaxed text-muted-foreground">
            {ar.settings.gmailSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <a className="mt-2 inline-block text-sm text-primary hover:underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">myaccount.google.com/apppasswords ↗</a>
        </Section>
      </div>
    </div>
  );
}
