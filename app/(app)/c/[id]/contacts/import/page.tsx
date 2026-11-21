import { PageHeader } from "@/components/app/bits";
import { ar } from "@/content/ar";
import { loadCompany, senderSettings } from "@/lib/company";
import { ImportWizard } from "./wizard";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let defaults = { allowSameDomain: false, allowResend: false };
  try {
    const s = senderSettings(await loadCompany(id));
    defaults = { allowSameDomain: s.allowSameDomain, allowResend: s.allowResend };
  } catch {}
  return (
    <>
      <PageHeader title={ar.import.title} />
      <ImportWizard id={id} defaults={defaults} />
    </>
  );
}
