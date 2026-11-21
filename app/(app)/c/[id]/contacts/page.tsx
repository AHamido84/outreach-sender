import { Download, Search, Upload, Users } from "lucide-react";
import Link from "next/link";
import { Empty, PageHeader } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { ar } from "@/content/ar";
import { loadCompany, senderSettings, type Ctx } from "@/lib/company";
import { facets, filterContacts, type ContactQuery } from "@/lib/contacts-query";
import { toErrorInfo } from "@/lib/errors";
import { TABS } from "@/lib/schema";
import { get } from "@/lib/table";
import { ContactsFilters } from "./filters";
import { ContactsTable, type ContactView } from "./table";

const PAGE = 50;

export default async function ContactsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<ContactQuery & { page?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  let ctx: Ctx;
  try {
    ctx = await loadCompany(id);
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
  const all = ctx.t[TABS.contacts].rows;
  const filtered = filterContacts(all, sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const slice = filtered.slice((page - 1) * PAGE, page * PAGE);
  const tz = senderSettings(ctx).tz;
  const slug = ctx.monday.values["Account Slug"] || "";
  const board = ctx.monday.values["Board ID"] || "";
  const rows: ContactView[] = slice.map((r) => ({
    id: get(r, "ID"), company: get(r, "Company"), name: get(r, "Contact Name"), title: get(r, "Title"), email: get(r, "Email"),
    phone: get(r, "Phone"), website: get(r, "Website"), industry: get(r, "Industry"), city: get(r, "City"), country: get(r, "Country"),
    language: get(r, "Language"), tags: get(r, "Tags"), source: get(r, "Source"), notes: get(r, "Notes"), status: get(r, "Status") || "New",
    step: get(r, "Step"), lastSent: get(r, "Last Sent At"), nextSend: get(r, "Next Send At"), mondayStatus: get(r, "monday Status"),
    mondayItem: get(r, "monday Item ID"), error: get(r, "Error"),
  }));
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={ar.contacts.title}
        description={`${filtered.length} / ${all.length}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href={`/c/${id}/contacts/export${qs ? `?${qs}` : ""}`}><Download />{ar.contacts.export}</a>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/c/${id}/contacts/find`}><Search />{ar.sources.button}</Link>
            </Button>
            <Button asChild>
              <Link href={`/c/${id}/contacts/import`}><Upload />{ar.contacts.import}</Link>
            </Button>
          </>
        }
      />
      <ContactsFilters facets={facets(all)} />
      {!all.length ? (
        <Empty icon={<Users className="size-8" />}>{ar.contacts.empty}</Empty>
      ) : (
        <ContactsTable id={id} rows={rows} tz={tz} page={page} pages={pages} total={filtered.length} pageSize={PAGE} mondaySlug={slug} mondayBoard={board} />
      )}
    </>
  );
}
