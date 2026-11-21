"use client";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Pencil, RefreshCw, Tag, Ban, Trash2, CheckCheck } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkAction, updateContact } from "@/app/actions/contacts";
import { Confirm } from "@/components/app/confirm";
import { errorMessage } from "@/components/app/error-box";
import { MondayBadge, StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ar } from "@/content/ar";
import { fmtDate } from "@/lib/format";
import { itemUrl } from "@/lib/monday-values";

export type ContactView = {
  id: string; company: string; name: string; title: string; email: string; phone: string; website: string; industry: string; city: string;
  country: string; language: string; tags: string; source: string; notes: string; status: string; step: string; lastSent: string;
  nextSend: string; mondayStatus: string; mondayItem: string; error: string;
};

const EDIT_FIELDS: [keyof ContactView, string][] = [
  ["company", "Company"], ["name", "Contact Name"], ["title", "Title"], ["email", "Email"], ["phone", "Phone"], ["website", "Website"],
  ["industry", "Industry"], ["city", "City"], ["country", "Country"], ["language", "Language"], ["tags", "Tags"], ["source", "Source"],
];
const STATUS_OPTIONS = ["New", "Ready", "Sent", "Replied", "Bounced", "Unsubscribed", "Completed", "Invalid", "Duplicate"];

export function ContactsTable(props: {
  id: string; rows: ContactView[]; tz: string; page: number; pages: number; total: number; pageSize: number; mondaySlug: string; mondayBoard: string;
}) {
  const { id, rows, tz, page, pages, total, pageSize } = props;
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<ContactView | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tags, setTags] = useState("");
  const [pending, start] = useTransition();

  const toggle = (cid: string) => setSel((s) => { const n = new Set(s); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const bulk = (action: Parameters<typeof bulkAction>[2], arg = "") =>
    start(async () => {
      const r = await bulkAction(id, [...sel], action, arg);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(`${ar.contacts.bulk.done} (${r.data.count})`);
      setSel(new Set());
      router.refresh();
    });

  const retryOne = (cid: string) =>
    start(async () => {
      const r = await bulkAction(id, [cid], "monday");
      if (!r.ok) return void toast.error(errorMessage(r.error));
      if (r.data.count) toast.success(ar.contacts.bulk.done);
      else toast.error(ar.contacts.mondayStatus.Failed);
      router.refresh();
    });

  const pageHref = (p: number) => {
    const n = new URLSearchParams(sp.toString());
    n.set("page", String(p));
    return `${path}?${n.toString()}`;
  };

  return (
    <>
      {sel.size > 0 && (
        <div className="sticky top-14 z-20 mb-2 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm">
          <span className="px-2 text-sm font-medium">{ar.contacts.bulk.selected(sel.size)}</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setTagsOpen(true)}><Tag />{ar.contacts.bulk.setTags}</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => bulk("ready")}><CheckCheck />{ar.contacts.bulk.markReady}</Button>
          <Confirm
            trigger={<Button size="sm" variant="outline" disabled={pending}><Ban />{ar.contacts.bulk.dnc}</Button>}
            description={ar.contacts.bulk.dncConfirm(sel.size)}
            onConfirm={() => bulk("dnc")}
          />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => bulk("monday")}><RefreshCw />{ar.contacts.bulk.retryMonday}</Button>
          <Confirm
            trigger={<Button size="sm" variant="destructive" disabled={pending}><Trash2 />{ar.contacts.bulk.delete}</Button>}
            description={ar.contacts.bulk.deleteConfirm(sel.size)}
            confirmLabel={ar.common.delete}
            destructive
            onConfirm={() => bulk("delete")}
          />
          {pending && <Loader2 className="size-4 animate-spin" />}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium">
              <th className="w-8"><Checkbox checked={all} onCheckedChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="select all" /></th>
              <th>ID</th>
              <th>{ar.fields.Company} / {ar.fields["Contact Name"]}</th>
              <th>{ar.fields.Email}</th>
              <th>{ar.fields.Status}</th>
              <th>{ar.fields["Last Sent At"]}</th>
              <th>{ar.fields["Next Send At"]}</th>
              <th>monday</th>
              <th>{ar.fields.Tags}</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className={`align-top hover:bg-muted/30 [&>td]:px-3 [&>td]:py-2 ${sel.has(r.id) ? "bg-primary/5" : ""}`}>
                <td><Checkbox checked={sel.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={r.id} /></td>
                <td className="font-mono text-xs text-muted-foreground">{r.id}</td>
                <td className="min-w-40">
                  <div className="font-medium">{r.company || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.name}{r.city ? ` · ${r.city}` : ""}{r.language === "EN" ? " · EN" : ""}</div>
                </td>
                <td className="font-mono text-xs">
                  {r.email}
                  {r.error && <div className="mt-0.5 max-w-56 truncate font-sans text-rose-600" title={r.error}>{r.error}</div>}
                </td>
                <td><StatusBadge status={r.status} />{r.step && <div className="mt-0.5 text-xs text-muted-foreground">{ar.fields.Step} {r.step}</div>}</td>
                <td className="whitespace-nowrap text-xs">{fmtDate(r.lastSent, tz)}</td>
                <td className="whitespace-nowrap text-xs">{fmtDate(r.nextSend, tz)}</td>
                <td className="whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <MondayBadge status={r.mondayStatus} />
                    {r.mondayItem && props.mondayBoard && (
                      <a href={itemUrl(props.mondaySlug, props.mondayBoard, r.mondayItem)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="monday">
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    {r.mondayStatus.startsWith("Failed") && (
                      <Button size="icon-xs" variant="ghost" title={`${ar.common.retry} — ${r.mondayStatus}`} onClick={() => retryOne(r.id)} disabled={pending}>
                        <RefreshCw />
                      </Button>
                    )}
                  </div>
                </td>
                <td className="max-w-36 truncate text-xs text-muted-foreground" title={r.tags}>{r.tags}</td>
                <td><Button size="icon-sm" variant="ghost" onClick={() => setEdit(r)} aria-label={ar.common.edit}><Pencil /></Button></td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">{ar.common.empty}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>{ar.contacts.showing(total ? (page - 1) * pageSize + 1 : 0, Math.min(total, page * pageSize), total)}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" disabled={page <= 1} asChild={page > 1}>
            {page > 1 ? <Link href={pageHref(page - 1)}><ChevronRight />{ar.common.previous}</Link> : <span><ChevronRight />{ar.common.previous}</span>}
          </Button>
          <span className="px-2 tabular-nums">{page} / {pages}</span>
          <Button size="sm" variant="outline" disabled={page >= pages} asChild={page < pages}>
            {page < pages ? <Link href={pageHref(page + 1)}>{ar.common.next}<ChevronLeft /></Link> : <span>{ar.common.next}<ChevronLeft /></span>}
          </Button>
        </div>
      </div>

      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{ar.contacts.bulk.setTags}</DialogTitle></DialogHeader>
          <Label htmlFor="bt">{ar.contacts.bulk.tagsPrompt}</Label>
          <Input id="bt" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, معرض-2026" />
          <DialogFooter>
            <Button onClick={() => { setTagsOpen(false); bulk("tags", tags); }}>{ar.common.apply}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {edit && <EditDialog id={id} contact={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditDialog({ id, contact, onClose }: { id: string; contact: ContactView; onClose: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => ({
    ...Object.fromEntries(EDIT_FIELDS.map(([k, h]) => [h, contact[k]])), Status: contact.status, Notes: contact.notes,
  }));
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const r = await updateContact(id, contact.id, v);
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.contacts.saved);
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{ar.contacts.editTitle} — <span className="font-mono text-sm">{contact.id}</span></DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {EDIT_FIELDS.map(([, h]) => (
            <div key={h} className="space-y-1">
              <Label htmlFor={`f-${h}`}>{ar.fields[h] || h}</Label>
              <Input id={`f-${h}`} value={v[h] || ""} dir={["Email", "Website", "Phone"].includes(h) ? "ltr" : undefined} onChange={(e) => setV({ ...v, [h]: e.target.value })} />
            </div>
          ))}
          <div className="space-y-1">
            <Label htmlFor="f-status">{ar.fields.Status}</Label>
            <select id="f-status" className="h-8 w-full rounded-lg border bg-background px-2 text-sm" value={/^Follow-up/.test(v.Status) ? v.Status : v.Status}
              onChange={(e) => setV({ ...v, Status: e.target.value })}>
              {[...new Set([v.Status, ...STATUS_OPTIONS])].map((s) => <option key={s} value={s}>{ar.status[s] || s}</option>)}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="f-notes">{ar.fields.Notes}</Label>
            <Textarea id="f-notes" value={v.Notes || ""} onChange={(e) => setV({ ...v, Notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{ar.common.cancel}</Button>
          <Button onClick={save} disabled={pending}>{pending && <Loader2 className="animate-spin" />}{ar.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
