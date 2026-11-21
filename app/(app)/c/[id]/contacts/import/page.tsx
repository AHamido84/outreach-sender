import { PageHeader } from "@/components/app/bits";
import { ar } from "@/content/ar";
import { ImportWizard } from "./wizard";

export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeader title={ar.import.title} />
      <ImportWizard id={id} />
    </>
  );
}
