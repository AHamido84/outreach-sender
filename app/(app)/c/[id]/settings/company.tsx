"use client";
import { Section } from "@/components/app/bits";
import { KvForm } from "@/components/app/kv-form";
import { SignatureSection } from "./signature";

export function CompanyTab({ id, values }: { id: string; values: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <Section>
        <KvForm
          id={id}
          tab="Company"
          values={values}
          fields={[
            { key: "Company Name" }, { key: "Website", type: "url" }, { key: "Phone", ltr: true }, { key: "WhatsApp", ltr: true },
            { key: "Address", span: 2 }, { key: "Short Description", type: "textarea" }, { key: "Profile Link", type: "url" },
            { key: "Booking Link", type: "url" }, { key: "Logo URL", type: "url", span: 2 },
          ]}
        />
      </Section>
      <SignatureSection
        id={id}
        signature={values["Signature"] || ""}
        append={/^(yes|on|true|1)$/i.test(values["Append Signature"] || "")}
        logoUrl={values["Logo URL"] || undefined}
      />
    </div>
  );
}
