import Link from "next/link";
import { PageHeader } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { ResultBadge } from "@/components/app/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ar } from "@/content/ar";
import { loadCompany, senderSettings, type Ctx } from "@/lib/company";
import { toErrorInfo } from "@/lib/errors";
import { fmtDate } from "@/lib/format";
import { TABS } from "@/lib/schema";
import { get } from "@/lib/table";
import { LogFilters } from "./filters";

const LIMIT = 300;

export default async function ActivityPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ run?: string; result?: string; type?: string; q?: string; tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let ctx: Ctx;
  try {
    ctx = await loadCompany(id, [TABS.sendLog, TABS.activity]);
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
  const tz = senderSettings(ctx).tz;
  const q = (sp.q || "").toLowerCase();
  const log = [...ctx.t[TABS.sendLog].rows]
    .reverse()
    .filter((r) => (!sp.run || get(r, "Run ID") === sp.run) && (!sp.result || get(r, "Result") === sp.result) && (!sp.type || get(r, "Run Type") === sp.type))
    .filter((r) => !q || ["Email", "Contact ID", "Error", "Template", "Run ID"].some((h) => get(r, h).toLowerCase().includes(q)));
  const act = [...ctx.t[TABS.activity].rows].reverse().filter((r) => !q || (get(r, "Action") + " " + get(r, "Details")).toLowerCase().includes(q));
  return (
    <>
      <PageHeader title={ar.activity.title} />
      <LogFilters />
      <Tabs defaultValue={sp.tab || "log"} className="gap-4">
        <TabsList>
          <TabsTrigger value="log">{ar.activity.sendLog} ({log.length})</TabsTrigger>
          <TabsTrigger value="activity">{ar.activity.activity} ({act.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="log">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium">
                  <th>{ar.activity.time}</th><th>{ar.activity.run}</th><th>{ar.activity.type}</th><th>{ar.send.contact}</th><th>{ar.send.template}</th>
                  <th>{ar.send.step}</th><th>{ar.send.result}</th><th>monday</th><th>{ar.activity.error}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.slice(0, LIMIT).map((r, i) => (
                  <tr key={i} className="align-top [&>td]:px-3 [&>td]:py-2">
                    <td className="whitespace-nowrap text-xs">{fmtDate(get(r, "Time"), tz)}</td>
                    <td><Link className="font-mono text-xs text-primary hover:underline" href={`?run=${encodeURIComponent(get(r, "Run ID"))}`}>{get(r, "Run ID")}</Link></td>
                    <td className="text-xs">{ar.runType[get(r, "Run Type")] || get(r, "Run Type")}</td>
                    <td><span className="font-mono text-xs">{get(r, "Contact ID")}</span><div className="font-mono text-xs text-muted-foreground">{get(r, "Email")}</div></td>
                    <td className="text-xs">{get(r, "Template")}</td>
                    <td className="text-xs">{get(r, "Step")}</td>
                    <td><ResultBadge result={get(r, "Result")} /></td>
                    <td className="text-xs">{get(r, "monday Result") || "—"}{get(r, "monday Error") && <div className="max-w-48 truncate text-rose-600" title={get(r, "monday Error")}>{get(r, "monday Error")}</div>}</td>
                    <td className="ltr max-w-64 text-xs text-rose-600"><span className="line-clamp-2" title={get(r, "Error")}>{get(r, "Error")}</span></td>
                  </tr>
                ))}
                {!log.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{ar.common.empty}</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-start [&>th]:font-medium"><th>{ar.activity.time}</th><th>{ar.activity.action}</th><th>{ar.activity.details}</th></tr>
              </thead>
              <tbody className="divide-y">
                {act.slice(0, LIMIT).map((r, i) => (
                  <tr key={i} className="align-top [&>td]:px-3 [&>td]:py-2">
                    <td className="whitespace-nowrap text-xs">{fmtDate(get(r, "Time"), tz)}</td>
                    <td className="whitespace-nowrap font-medium">{get(r, "Action")}</td>
                    <td className="ltr text-xs text-muted-foreground">{get(r, "Details")}</td>
                  </tr>
                ))}
                {!act.length && <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">{ar.common.empty}</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
