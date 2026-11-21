import { describe, expect, it } from "vitest";
import { buildVars, firstName, render, renderEmail, toHtml, usedVars } from "@/lib/template";

const company = { "Company Name": "شركة النور", "Profile Link": "https://x.co/p", "Booking Link": "", Signature: "أحمد\nمدير" };
const sender = { "From Name": "أحمد", "Unsubscribe Line": "للإلغاء ردّ بـ«لا» {link}" };
const contact = { _row: 2, ID: "C0001", "Contact Name": "م. محمد علي", Company: "أكمي", City: "الرياض", Industry: "", "Tags": "vip" };

describe("template rendering", () => {
  it("builds vars including contact columns", () => {
    const v = buildVars({ company, sender, contact, unsubscribeLink: "https://app/u/t" });
    expect(v.first_name).toBe("محمد");
    expect(v.our_company).toBe("شركة النور");
    expect(v.tags).toBe("vip");
    expect(v.contact_name).toBe("م. محمد علي");
    expect(v.unsubscribe).toBe("للإلغاء ردّ بـ«لا» https://app/u/t");
  });
  it("renders and reports empty/unknown variables", () => {
    const v = buildVars({ company, sender, contact });
    const r = render("أهلاً {first_name} من {Company} في {city} — {industry} {booking_link} {nope}", v);
    expect(r.text.startsWith("أهلاً محمد من أكمي في الرياض")).toBe(true);
    expect(r.missing).toEqual(["industry", "booking_link", "nope"]);
  });
  it("lists used variables", () => {
    expect(usedVars("{a} {b} {a} {Contact Name}")).toEqual(["a", "b", "contact_name"]);
  });
  it("strips titles from first names", () => {
    expect(firstName("Dr. John Smith")).toBe("John");
    expect(firstName("أ. سارة")).toBe("سارة");
    expect(firstName("")).toBe("");
  });
  it("produces RTL html for Arabic and LTR for English, escaped and linked", () => {
    const ar = toHtml("مرحبا <b>\nhttps://a.com", "AR");
    expect(ar).toContain('dir="rtl"');
    expect(ar).toContain("&lt;b&gt;");
    expect(ar).toContain('<a href="https://a.com">');
    expect(toHtml("hi", "EN")).toContain('dir="ltr"');
  });
  it("renderEmail merges missing from subject and body", () => {
    const e = renderEmail({ subject: "{company} x {zzz}", body: "{zzz} {first_name}", language: "AR" }, buildVars({ company, sender, contact }));
    expect(e.subject).toBe("أكمي x");
    expect(e.missing).toEqual(["zzz"]);
  });
});
