import { loadCompany } from "@/lib/company";
import { filterContacts, toCsv } from "@/lib/contacts-query";
import { requireSession } from "@/lib/auth-server";
import { TABS } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const ctx = await loadCompany(id);
  const t = ctx.t[TABS.contacts];
  const rows = filterContacts(t.rows, Object.fromEntries(sp.entries()));
  return new Response(toCsv(t.headers.filter(Boolean), rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
