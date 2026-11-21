"use client";
import { Section } from "@/components/app/bits";
import { KvForm } from "@/components/app/kv-form";
import { ar } from "@/content/ar";

const HOURS: [string, string][] = Array.from({ length: 25 }, (_, h) => [String(h), `${String(h).padStart(2, "0")}:00`]);

export function AutoSettings({ id, values }: { id: string; values: Record<string, string> }) {
  return (
    <Section title={ar.settings.sections.limits}>
      <KvForm
        id={id}
        tab="Sender"
        values={values}
        fields={[
          { key: "Daily Limit", type: "number" },
          { key: "Emails Per Run", type: "number" },
          { key: "Delay Between Emails", type: "number" },
          { key: "Max Bounce Rate", type: "number" },
          { key: "Send Days", type: "days" },
          { key: "Send Start Hour", type: "select", options: HOURS },
          { key: "Send End Hour", type: "select", options: HOURS },
          { key: "Timezone", ltr: true, hint: "Africa/Cairo · Asia/Riyadh · Asia/Dubai · Europe/London" },
        ]}
      />
    </Section>
  );
}
