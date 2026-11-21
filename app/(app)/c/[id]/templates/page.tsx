import { PageHeader } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { ar } from "@/content/ar";
import { loadCompany, type Ctx } from "@/lib/company";
import { toErrorInfo } from "@/lib/errors";
import { TABS } from "@/lib/schema";
import { get } from "@/lib/table";
import { BUILTIN_VARS, varName } from "@/lib/template";
import { TemplatesEditor } from "./editor";

export default async function TemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ctx: Ctx;
  try {
    ctx = await loadCompany(id);
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
  const contacts = ctx.t[TABS.contacts].rows.slice(0, 300).map((r) => ({
    id: get(r, "ID"), label: `${get(r, "ID")} — ${get(r, "Company") || get(r, "Contact Name") || get(r, "Email")}`, language: get(r, "Language"),
  }));
  const SYSTEM_COLS = ["Status", "Step", "Version", "Last Sent At", "Next Send At", "Last Message ID", "Thread References", "monday Item ID", "monday Status", "Error", "Added At", "ID"];
  const contactVars = ctx.t[TABS.contacts].headers.filter((h) => h && !SYSTEM_COLS.includes(h)).map(varName).filter((v) => !(BUILTIN_VARS as readonly string[]).includes(v));
  return (
    <>
      <PageHeader title={ar.templates.title} description={ar.templates.followupSubject} />
      <TemplatesEditor
        id={id}
        templates={ctx.templates.map(({ _row, ...t }) => t)}
        contacts={contacts}
        builtins={[...BUILTIN_VARS]}
        contactVars={contactVars}
      />
    </>
  );
}
