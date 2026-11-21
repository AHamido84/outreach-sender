"use client";
import { Section } from "@/components/app/bits";
import { KvForm } from "@/components/app/kv-form";

export function CompanyTab({ id, values }: { id: string; values: Record<string, string> }) {
  return (
    <Section>
      <KvForm
        id={id}
        tab="Company"
        values={values}
        fields={[
          { key: "Company Name" }, { key: "Website", type: "url" }, { key: "Phone", ltr: true }, { key: "WhatsApp", ltr: true },
          { key: "Address", span: 2 }, { key: "Short Description", type: "textarea" }, { key: "Profile Link", type: "url" },
          { key: "Booking Link", type: "url" }, { key: "Logo URL", type: "url", span: 2 }, { key: "Signature", type: "textarea" },
        ]}
      />
    </Section>
  );
}
