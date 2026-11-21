import { AutoPanel } from "@/components/app/auto-panel";
import { PageHeader } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ar } from "@/content/ar";
import { loadCompany, senderSettings, type Ctx } from "@/lib/company";
import { toErrorInfo } from "@/lib/errors";
import { facets } from "@/lib/contacts-query";
import { TABS } from "@/lib/schema";
import { get } from "@/lib/table";
import { autoStatus } from "@/lib/views";
import { AutoSettings } from "./auto-settings";
import { ManualSend } from "./manual";
import { ScheduleTab } from "./schedule";

export default async function SendPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  let ctx: Ctx;
  try {
    ctx = await loadCompany(id, [TABS.sendLog, TABS.schedule]);
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
  const s = senderSettings(ctx);
  const status = autoStatus(ctx, ctx.t[TABS.sendLog].rows);
  const schedule = [...ctx.t[TABS.schedule].rows]
    .sort((a, b) => get(b, "Run At").localeCompare(get(a, "Run At")))
    .map((r) => ({ runId: get(r, "Run ID"), runAt: get(r, "Run At"), count: get(r, "Count"), filter: get(r, "Filter"), status: get(r, "Status") || "Pending", result: get(r, "Result") }));
  const { tags } = facets(ctx.t[TABS.contacts].rows);
  const v = ctx.sender.values;
  return (
    <>
      <PageHeader title={ar.send.title} description={ar.send.limitInfo(status.sentToday, status.dailyLimit)} />
      <Tabs defaultValue={tab || "manual"} className="gap-4">
        <TabsList>
          <TabsTrigger value="manual">{ar.send.manual}</TabsTrigger>
          <TabsTrigger value="schedule">{ar.send.schedule}</TabsTrigger>
          <TabsTrigger value="auto">{ar.send.auto}</TabsTrigger>
        </TabsList>
        <TabsContent value="manual">
          <ManualSend id={id} tags={tags} tz={s.tz} mondaySlug={v["Account Slug"] || ""} mondayBoard={v["Board ID"] || ctx.monday.values["Board ID"] || ""} />
        </TabsContent>
        <TabsContent value="schedule">
          <ScheduleTab id={id} rows={schedule} tz={s.tz} tags={tags} />
        </TabsContent>
        <TabsContent value="auto" className="space-y-4">
          <AutoPanel id={id} status={status} />
          <AutoSettings
            id={id}
            values={{
              "Daily Limit": v["Daily Limit"] || "", "Emails Per Run": v["Emails Per Run"] || "", "Delay Between Emails": v["Delay Between Emails"] || "",
              "Send Days": v["Send Days"] || "", "Send Start Hour": v["Send Start Hour"] || "", "Send End Hour": v["Send End Hour"] || "",
              Timezone: v["Timezone"] || "", "Max Bounce Rate": v["Max Bounce Rate"] || "",
            }}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
