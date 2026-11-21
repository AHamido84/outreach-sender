import { PageHeader } from "@/components/app/bits";
import { ErrorBox } from "@/components/app/error-box";
import { ar } from "@/content/ar";
import { loadWithSources, senderSettings } from "@/lib/company";
import { toErrorInfo } from "@/lib/errors";
import { sourceSettings } from "@/lib/sources";
import { SourceFinder } from "./finder";

export default async function FindPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const ctx = await loadWithSources(id);
    const s = sourceSettings(ctx.sources);
    const snd = senderSettings(ctx);
    const v = ctx.sources.values;
    return (
      <>
        <PageHeader title={ar.sources.title} />
        <SourceFinder
          id={id}
          connected={{ apollo: !!v["Apollo API Key"], hunter: !!v["Hunter API Key"], outscraper: !!v["Outscraper API Key"] }}
          defaults={{
            tags: s.defaultTags, status: s.defaultStatus, allowSameDomain: snd.allowSameDomain, allowResend: snd.allowResend,
            hunterType: s.hunterType, hunterMin: s.hunterMinConfidence, outFindEmails: s.outFindEmails,
          }}
        />
      </>
    );
  } catch (e) {
    return <ErrorBox error={toErrorInfo(e)} />;
  }
}
