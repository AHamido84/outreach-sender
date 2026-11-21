import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { ErrorBox } from "@/components/app/error-box";
import { CompanyNav } from "@/components/app/company-nav";
import { ar } from "@/content/ar";
import { getCompanyRef, type CompanyRef } from "@/lib/company";
import { toErrorInfo } from "@/lib/errors";

export default async function CompanyLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  let ref: CompanyRef;
  try {
    ref = await getCompanyRef(id);
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">{ar.nav.companies}</Link>
        <span className="text-muted-foreground">/</span>
        <span className="size-2.5 rounded-full" style={{ background: ref.color }} />
        <span className="font-semibold">{ref.name}</span>
        <a href={ref.url} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ExternalLink className="size-3" /> {ar.common.openSheet}
        </a>
      </div>
      <CompanyNav id={id} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
