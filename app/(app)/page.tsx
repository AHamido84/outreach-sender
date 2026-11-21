import { AlertTriangle, Building2, Clock } from "lucide-react";
import Link from "next/link";
import { Empty, PageHeader, Progress2 } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { SchedulerHealthBadge } from "@/components/app/scheduler-health";
import { ar, warningText } from "@/content/ar";
import { getStore } from "@/lib/sheets";
import { fmtRelative } from "@/lib/format";
import { toErrorInfo } from "@/lib/errors";
import { companyCards } from "@/lib/views";
import { AddCompany } from "./add-company";

export default async function CompaniesPage() {
  let data: Awaited<ReturnType<typeof companyCards>>;
  try {
    data = await companyCards();
  } catch (e) {
    return (
      <>
        <PageHeader title={ar.companies.title} />
        <ErrorBox error={toErrorInfo(e)} />
      </>
    );
  }
  const { cards, health } = data;
  return (
    <>
      <PageHeader
        title={ar.companies.title}
        actions={
          <>
            <SchedulerHealthBadge health={health} />
            <AddCompany serviceAccount={getStore().serviceAccountEmail()} />
          </>
        }
      />
      {!cards.length ? (
        <Empty icon={<Building2 className="size-8" />}>{ar.companies.empty}</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.ref.id}
              href={`/c/${c.ref.id}`}
              className="group relative overflow-hidden rounded-xl border bg-card p-4 transition hover:shadow-md"
            >
              <span className="absolute inset-y-0 start-0 w-1" style={{ background: c.ref.color }} />
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold group-hover:text-primary">{c.ref.name}</h2>
                {c.auto !== undefined && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${c.auto ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                    {ar.companies.auto}: {c.auto ? ar.common.on : ar.common.off}
                  </span>
                )}
              </div>
              {!c.ref.active && <p className="mt-1 text-xs text-muted-foreground">{ar.companies.inactive}</p>}
              {c.error ? (
                <ErrorBox error={c.error} className="mt-3" />
              ) : (
                <>
                  <div className="mt-4 flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">{ar.companies.sentToday}</span>
                    <span className="font-semibold tabular-nums">
                      {c.sentToday} / {c.dailyLimit}
                    </span>
                  </div>
                  <Progress2 value={c.sentToday || 0} max={c.dailyLimit || 0} className="mt-1.5" />
                  <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {ar.companies.lastRun}: {fmtRelative(c.lastRun)}
                    {c.lastRunResult && <span className="ltr truncate">· {c.lastRunResult}</span>}
                  </p>
                  {!!c.warnings.length && (
                    <ul className="mt-3 space-y-1">
                      {c.warnings.slice(0, 3).map((w, i) => (
                        <li key={i} className={`flex items-start gap-1.5 text-xs ${w.level === "error" ? "text-rose-600" : "text-amber-700"}`}>
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          {warningText(w.code, ...(w.args || []))}
                        </li>
                      ))}
                      {c.warnings.length > 3 && <li className="text-xs text-muted-foreground">+{c.warnings.length - 3}</li>}
                    </ul>
                  )}
                </>
              )}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
