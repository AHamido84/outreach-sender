// Column mapping suggestions for imports (Arabic + English synonyms). Safe to use in the browser.

export const IMPORT_FIELDS = [
  "Company", "Contact Name", "Title", "Email", "Phone", "Website", "Industry", "City", "Country", "Language", "Tags", "Source", "Notes",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

const SYN: Record<ImportField, string[]> = {
  Company: ["company", "company name", "organization", "organisation", "business", "business name", "account", "الشركة", "اسم الشركة", "المؤسسة", "النشاط", "اسم النشاط", "الجهة"],
  "Contact Name": ["contact name", "name", "full name", "contact", "person", "first name", "الاسم", "اسم", "الاسم الكامل", "اسم الشخص", "المسؤول", "جهة الاتصال", "اسم المسؤول"],
  Title: ["title", "job title", "position", "role", "designation", "المسمى", "المسمى الوظيفي", "الوظيفة", "المنصب"],
  Email: ["email", "e-mail", "email address", "mail", "emails", "الإيميل", "الايميل", "البريد", "البريد الإلكتروني", "البريد الالكتروني", "ايميل", "إيميل"],
  Phone: ["phone", "phone number", "mobile", "tel", "telephone", "whatsapp", "الهاتف", "رقم الهاتف", "الجوال", "الموبايل", "رقم الجوال", "تليفون", "واتساب", "التليفون"],
  Website: ["website", "web", "site", "url", "domain", "web site", "الموقع", "الموقع الإلكتروني", "الموقع الالكتروني", "الويب", "رابط الموقع"],
  Industry: ["industry", "category", "sector", "type", "niche", "المجال", "القطاع", "التصنيف", "الفئة", "النوع", "نوع النشاط"],
  City: ["city", "town", "location", "المدينة", "مدينة", "المنطقة"],
  Country: ["country", "الدولة", "البلد", "دولة"],
  Language: ["language", "lang", "اللغة"],
  Tags: ["tags", "tag", "labels", "الوسوم", "وسوم", "تاج", "تصنيفات"],
  Source: ["source", "lead source", "المصدر", "مصدر"],
  Notes: ["notes", "note", "comments", "description", "ملاحظات", "ملاحظة", "تعليق", "الوصف"],
};

function norm(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-.:]+/g, " ")
    .replace(/[ً-ْ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim();
}

/** Map each source header to the best target field ('' = ignore). Each target is used at most once. */
export function suggestMapping(headers: string[]): Record<string, ImportField | ""> {
  const out: Record<string, ImportField | ""> = {};
  const used = new Set<ImportField>();
  const score = (h: string, f: ImportField) => {
    const n = norm(h);
    const syns = [f, ...SYN[f]].map(norm);
    if (syns.includes(n)) return 3;
    if (syns.some((s) => s.length > 2 && (n.startsWith(s) || n.endsWith(s)))) return 2;
    if (syns.some((s) => s.length > 3 && n.includes(s))) return 1;
    return 0;
  };
  const pairs: { h: string; f: ImportField; s: number }[] = [];
  for (const h of headers) for (const f of IMPORT_FIELDS) {
    const s = score(h, f);
    if (s) pairs.push({ h, f, s });
  }
  pairs.sort((a, b) => b.s - a.s);
  for (const h of headers) out[h] = "";
  for (const p of pairs) {
    if (out[p.h] || used.has(p.f)) continue;
    out[p.h] = p.f;
    used.add(p.f);
  }
  return out;
}
