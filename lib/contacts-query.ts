// Contacts search / filter (shared by the page and CSV export).
import { normalizeLanguage } from "./template";
import { splitTags } from "./selection";
import { get, type Row } from "./table";

export type ContactQuery = { q?: string; status?: string; tag?: string; lang?: string; source?: string; monday?: string };

export function filterContacts(rows: Row[], f: ContactQuery): Row[] {
  const q = (f.q || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status) {
      const st = get(r, "Status") || "New";
      if (f.status === "Follow-up" ? !/^Follow-up/.test(st) : st !== f.status) return false;
    }
    if (f.tag && !splitTags(get(r, "Tags")).map((t) => t.toLowerCase()).includes(f.tag.toLowerCase())) return false;
    if (f.lang && normalizeLanguage(get(r, "Language")) !== f.lang) return false;
    if (f.source && get(r, "Source") !== f.source) return false;
    if (f.monday) {
      const m = get(r, "monday Status");
      if (f.monday === "Synced" && m !== "Synced") return false;
      if (f.monday === "Failed" && !m.startsWith("Failed")) return false;
      if (f.monday === "none" && m) return false;
    }
    if (q) {
      const hay = ["ID", "Company", "Contact Name", "Email", "Phone", "City", "Industry", "Tags", "Notes"].map((h) => get(r, h)).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function facets(rows: Row[]) {
  const tags = new Set<string>();
  const sources = new Set<string>();
  for (const r of rows) {
    splitTags(get(r, "Tags")).forEach((t) => tags.add(t));
    if (get(r, "Source")) sources.add(get(r, "Source"));
  }
  return { tags: [...tags].sort(), sources: [...sources].sort() };
}

export function toCsv(headers: string[], rows: Row[]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return "﻿" + [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(get(r, h))).join(","))].join("\r\n");
}
