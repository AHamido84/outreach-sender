// Convert our values to monday column_values JSON by column type.
import type { MondayField } from "./schema";

export function columnValue(type: string, value: string): unknown {
  const v = String(value ?? "").trim();
  switch (type) {
    case "status":
    case "color":
      return v ? { label: v.slice(0, 40) } : null;
    case "date": {
      if (!v) return null;
      const d = new Date(v);
      if (isNaN(d.getTime())) return null;
      const iso = d.toISOString();
      return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
    }
    case "email":
      return v ? { email: v, text: v } : null;
    case "phone":
      return v ? { phone: v.replace(/[^\d+]/g, ""), countryShortName: "" } : null;
    case "link":
      return v ? { url: /^https?:\/\//.test(v) ? v : `https://${v}`, text: v } : null;
    case "long_text":
      return v ? { text: v } : null;
    case "numbers":
    case "numeric":
      return v && !isNaN(Number(v)) ? v : null;
    case "dropdown":
      return v ? { labels: [v] } : null;
    default:
      return v;
  }
}

/** Suggested monday column type when creating a missing column for a field. */
export const FIELD_COLUMN_TYPES: Record<MondayField, { type: string; title: string }> = {
  email: { type: "email", title: "Email" },
  status: { type: "status", title: "Outreach Status" },
  step: { type: "numbers", title: "Step" },
  "last sent": { type: "date", title: "Last Sent" },
  "next send": { type: "date", title: "Next Send" },
  company: { type: "text", title: "Company" },
  person: { type: "text", title: "Contact Person" },
  phone: { type: "phone", title: "Phone" },
  website: { type: "link", title: "Website" },
  city: { type: "text", title: "City" },
  industry: { type: "text", title: "Industry" },
  source: { type: "text", title: "Source" },
  notes: { type: "long_text", title: "Notes" },
};

/** Which Contacts column feeds each monday field. */
export const FIELD_SOURCE: Record<MondayField, string> = {
  email: "Email",
  status: "Status",
  step: "Step",
  "last sent": "Last Sent At",
  "next send": "Next Send At",
  company: "Company",
  person: "Contact Name",
  phone: "Phone",
  website: "Website",
  city: "City",
  industry: "Industry",
  source: "Source",
  notes: "Notes",
};

export function itemUrl(slug: string, boardId: string, itemId: string): string {
  return slug ? `https://${slug}.monday.com/boards/${boardId}/pulses/${itemId}` : `https://monday.com/boards/${boardId}/pulses/${itemId}`;
}
