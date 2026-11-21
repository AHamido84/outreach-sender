"use client";
import { ExternalLink, Loader2, Trash2, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeCompany, repairSheet } from "@/app/actions/companies";
import { Section } from "@/components/app/bits";
import { Confirm } from "@/components/app/confirm";
import { CopyButton } from "@/components/app/copy-button";
import { errorMessage } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { ar } from "@/content/ar";

export function AdvancedTab({ id, url, serviceAccount }: { id: string; url: string; serviceAccount: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title={ar.settings.sheet}>
        <Button variant="outline" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink />{ar.common.openSheet}</a></Button>
        <p className="mt-4 text-sm text-muted-foreground">{ar.settings.serviceAccount}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <code className="ltr rounded bg-muted px-2 py-1 text-xs">{serviceAccount}</code>
          <CopyButton value={serviceAccount} />
        </div>
      </Section>
      <Section title={ar.settings.repair}>
        <p className="mb-3 text-sm text-muted-foreground">{ar.settings.repairHint}</p>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const r = await repairSheet(id);
          if (!r.ok) return void toast.error(errorMessage(r.error));
          toast.success(`${ar.settings.repaired} (${r.data.createdTabs.length} tabs, ${r.data.addedHeaders.length} columns, ${r.data.addedKeys.length} keys)`);
          router.refresh();
        })}>
          {pending ? <Loader2 className="animate-spin" /> : <Wrench />}{ar.settings.repair}
        </Button>
      </Section>
      <Section title={ar.settings.remove} className="md:col-span-2 border-destructive/30">
        <p className="mb-3 text-sm text-muted-foreground">{ar.settings.removeHint}</p>
        <Confirm
          trigger={<Button variant="destructive" disabled={pending}><Trash2 />{ar.settings.remove}</Button>}
          description={ar.settings.removeConfirm}
          destructive
          confirmLabel={ar.settings.remove}
          onConfirm={() => start(async () => {
            const r = await removeCompany(id);
            if (!r.ok) return void toast.error(errorMessage(r.error));
            toast.success(ar.settings.removed);
            router.push("/");
          })}
        />
      </Section>
    </div>
  );
}
