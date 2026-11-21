import { PageHeader } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ar } from "@/content/ar";
import { loadWithSources, type Ctx } from "@/lib/company";
import { maskSecret } from "@/lib/crypto";
import { toErrorInfo } from "@/lib/errors";
import { MONDAY_FIELDS, TABS } from "@/lib/schema";
import { getStore } from "@/lib/sheets";
import { get } from "@/lib/table";
import { AdvancedTab } from "./advanced";
import { CompanyTab } from "./company";
import { DncTab } from "./dnc";
import { MondayTab } from "./monday";
import { SenderTab } from "./sender";
import { SourcesTab } from "./sources";

export default async function SettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  let ctx: Ctx & { sources: NonNullable<Ctx["sources"]> };
  try {
    ctx = await loadWithSources(id);
  } catch (e) {
    return (
      <>
        <ErrorBox error={toErrorInfo(e)} />
        <div className="mt-4"><AdvancedTab id={id} url={`https://docs.google.com/spreadsheets/d/${id}/edit`} serviceAccount={getStore().serviceAccountEmail()} /></div>
      </>
    );
  }
  const s = ctx.sender.values;
  const m = ctx.monday.values;
  // Secrets never leave the server: only "set ✓ ••••1234".
  const senderValues = Object.fromEntries(Object.entries(s).filter(([k]) => !/Password/.test(k)));
  return (
    <>
      <PageHeader title={ar.settings.title} />
      <Tabs defaultValue={tab || "company"} className="gap-4">
        <TabsList className="flex-wrap">
          {Object.entries(ar.settings.tabs).map(([k, l]) => <TabsTrigger key={k} value={k}>{l}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="company"><CompanyTab id={id} values={ctx.company.values} /></TabsContent>
        <TabsContent value="sender">
          <SenderTab
            id={id}
            values={senderValues}
            secrets={{ "SMTP Password": maskSecret(s["SMTP Password"]), "IMAP Password": maskSecret(s["IMAP Password"]) }}
            smtpTestedAt={s["SMTP Tested At"] || ""}
            imapTestedAt={s["IMAP Tested At"] || ""}
          />
        </TabsContent>
        <TabsContent value="monday">
          <MondayTab
            id={id}
            token={maskSecret(m["API Token"])}
            boardId={m["Board ID"] || ""}
            groupId={m["Group ID"] || ""}
            createOn={m["Create Item On"] || "first send"}
            updateOnReply={!/^(no|false|0|off)$/i.test(m["Update Status On Reply"] || "yes")}
            mapping={Object.fromEntries(MONDAY_FIELDS.map((f) => [f, ctx.monday.mapping[f] || ""]))}
            failed={ctx.t[TABS.contacts].rows.filter((r) => get(r, "monday Status").startsWith("Failed")).length}
          />
        </TabsContent>
        <TabsContent value="sources">
          <SourcesTab
            id={id}
            serviceAccount={getStore().serviceAccountEmail()}
            values={Object.fromEntries(Object.entries(ctx.sources.values).filter(([k]) => !/API Key/.test(k)))}
            keys={{
              apollo: maskSecret(ctx.sources.values["Apollo API Key"]),
              hunter: maskSecret(ctx.sources.values["Hunter API Key"]),
              outscraper: maskSecret(ctx.sources.values["Outscraper API Key"]),
            }}
          />
        </TabsContent>
        <TabsContent value="dnc">
          <DncTab id={id} rows={ctx.t[TABS.dnc].rows.map((r) => ({ value: get(r, "Email or Domain"), reason: get(r, "Reason"), at: get(r, "Added At") }))} />
        </TabsContent>
        <TabsContent value="advanced">
          <AdvancedTab id={id} url={ctx.ref.url} serviceAccount={getStore().serviceAccountEmail()} />
        </TabsContent>
      </Tabs>
    </>
  );
}
