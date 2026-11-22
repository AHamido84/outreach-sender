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

describe("rich (HTML) bodies", () => {
  const v = buildVars({ company, sender, contact });
  const body =
    '<p style="text-align: center">أهلاً <strong>{first_name}</strong></p><p>سجّل من <a href="https://x.co/reg?a=1&amp;b=2">رابط التسجيل</a> أو <a href="{profile_link}">ملفنا</a></p><p><span style="color: #e11d48; font-family: Georgia">{signature}</span></p>';
  it("detects HTML vs plain bodies", async () => {
    const { isHtmlBody } = await import("@/lib/template");
    expect(isHtmlBody(body)).toBe(true);
    expect(isHtmlBody("سطر\nسطر <3")).toBe(false);
  });
  it("renders variables (escaped, line breaks kept) inside HTML with inline styles for email", () => {
    const e = renderEmail({ subject: "s", body, language: "AR" }, { ...v, first_name: "<محمد>" });
    expect(e.html).toContain("&lt;محمد&gt;");
    expect(e.html).toContain('href="https://x.co/p"');
    expect(e.html).toContain("أحمد<br>مدير");
    expect(e.html).toContain('style="margin:0 0 12px;text-align: center"');
    expect(e.html).toMatch(/<a style="color:#0f766e;" href=|<a href="[^"]*" style="color:#0f766e;"/);
    expect(e.missing).toEqual([]);
  });
  it("builds a plain-text part with link text and URL", () => {
    const e = renderEmail({ subject: "s", body, language: "AR" }, v);
    expect(e.text).toContain("رابط التسجيل (https://x.co/reg?a=1&b=2)");
    expect(e.text).toContain("ملفنا (https://x.co/p)");
    expect(e.text).toContain("أحمد\nمدير");
    expect(e.text).not.toContain("<");
  });
  it("converts old plain bodies to editor HTML", async () => {
    const { plainToHtml } = await import("@/lib/template");
    expect(plainToHtml("أ\nب\n\nج <x>")).toBe("<p>أ<br>ب</p><p>ج &lt;x&gt;</p>");
  });
});

describe("rich bodies: URLs from variables", () => {
  it("makes bare URL values clickable and fills href variables", () => {
    const v = { ...buildVars({ company, sender, contact }), booking_link: "https://cal.com/x?a=1&b=2" };
    const e = renderEmail({ subject: "s", body: '<p>{booking_link}</p><p><a href="{booking_link}">احجز</a></p><p><a href="{missing_link}">x</a></p>', language: "AR" }, v);
    expect(e.html).toContain('<a href="https://cal.com/x?a=1&amp;b=2" style="color:#0f766e;">https://cal.com/x?a=1&amp;b=2</a>');
    expect(e.html).toContain('href="https://cal.com/x?a=1&amp;b=2" style="color:#0f766e;">احجز</a>');
    expect(e.missing).toEqual(["missing_link"]);
    expect(e.text).toContain("احجز (https://cal.com/x?a=1&b=2)");
  });
});

describe("web fonts", () => {
  it("links Cairo only when the body uses it", () => {
    const v = buildVars({ company, sender, contact });
    const withCairo = renderEmail({ subject: "s", body: '<p><span style="font-family: Cairo, Tahoma, sans-serif">مرحبا</span></p>', language: "AR" }, v);
    expect(withCairo.html).toContain("fonts.googleapis.com/css2?family=Cairo");
    const plain = renderEmail({ subject: "s", body: "<p>مرحبا</p>", language: "AR" }, v);
    expect(plain.html).not.toContain("fonts.googleapis.com");
  });
});

describe("signature", () => {
  const richSig = '<p><strong>أحمد سمير</strong></p><p><img src="https://x.co/logo.png" width="120"></p><p><a href="https://x.co">x.co</a></p>';
  const v = { ...buildVars({ company: { ...company, Signature: richSig }, sender, contact }) };
  it("inserts a rich signature as HTML (not escaped, not nested in <p>)", () => {
    const e = renderEmail({ subject: "s", body: "<p>أهلاً</p><p>{signature}</p>", language: "AR" }, v);
    expect(e.html).toContain("<strong>أحمد سمير</strong>");
    expect(e.html).not.toContain("&lt;strong&gt;");
    expect(e.html).toMatch(/<div><p style="[^"]*"><strong>/);
    expect(e.html).toContain('<img src="https://x.co/logo.png" width="120" style="max-width:100%;height:auto;border:0;">');
    expect(e.text).toContain("أحمد سمير");
  });
  it("works in old plain-text bodies too", () => {
    const e = renderEmail({ subject: "s", body: "أهلاً\n\n{signature}", language: "AR" }, v);
    expect(e.html).toContain("<strong>أحمد سمير</strong>");
  });
  it("appends the signature automatically when the template doesn't use it", () => {
    const e = renderEmail({ subject: "s", body: "<p>أهلاً</p>", language: "AR" }, v, { appendSignature: true });
    expect(e.html).toContain("<strong>أحمد سمير</strong>");
    const twice = renderEmail({ subject: "s", body: "<p>{signature}</p>", language: "AR" }, v, { appendSignature: true });
    expect(twice.html.match(/أحمد سمير/g)).toHaveLength(1);
    const off = renderEmail({ subject: "s", body: "<p>أهلاً</p>", language: "AR" }, v);
    expect(off.html).not.toContain("أحمد سمير");
  });
});
