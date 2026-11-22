import { describe, expect, it } from "vitest";
import { buildDnc, classifyImport, cleanEmail, companyDomain, isBlocked, isValidEmail, websiteDomain } from "@/lib/emails";

describe("email cleaning", () => {
  it("lowercases, trims and strips mailto", () => {
    expect(cleanEmail("  MAILTO:Info@ACME.com ").email).toBe("info@acme.com");
  });
  it("picks the email that matches the website domain", () => {
    const r = cleanEmail("ali@gmail.com; sales@acme.com, x@other.org", "https://www.acme.com/about");
    expect(r.email).toBe("sales@acme.com");
    expect(r.all).toHaveLength(3);
  });
  it("falls back to the first valid email", () => {
    expect(cleanEmail("a@b.co / c@d.com", "").email).toBe("a@b.co");
  });
  it("flags invalid emails", () => {
    expect(cleanEmail("not an email").valid).toBe(false);
    expect(isValidEmail("a..b@x.com")).toBe(false);
    expect(isValidEmail("ok@sub.x.io")).toBe(true);
  });
  it("parses website domains", () => {
    expect(websiteDomain("HTTPS://www.Acme.com/x?y")).toBe("acme.com");
    expect(websiteDomain("acme.com")).toBe("acme.com");
    expect(websiteDomain("")).toBe("");
  });
  it("ignores free mail providers for company domain", () => {
    expect(companyDomain("x@gmail.com")).toBe("");
    expect(companyDomain("x@acme.com")).toBe("acme.com");
    expect(companyDomain("x@gmail.com", "acme.io")).toBe("acme.io");
  });
});

describe("do not contact", () => {
  const dnc = buildDnc(["Bad@x.com", "@spam.io", "competitor.com", "https://www.other.net"]);
  it("blocks emails and domains (incl. subdomains)", () => {
    expect(isBlocked("bad@x.com", dnc)).toBe(true);
    expect(isBlocked("a@spam.io", dnc)).toBe(true);
    expect(isBlocked("a@mail.competitor.com", dnc)).toBe(true);
    expect(isBlocked("a@other.net", dnc)).toBe(true);
    expect(isBlocked("good@x.com", dnc)).toBe(false);
  });
});

describe("import dedup", () => {
  it("classifies valid / invalid / duplicate / dnc", () => {
    const res = classifyImport(
      [
        { email: "new@fresh.com" },
        { email: "broken" },
        { email: "Old@Existing.com" },
        { email: "other@existing.com" }, // same company domain
        { email: "new@fresh.com" }, // duplicate inside the file
        { email: "a@gmail.com" },
        { email: "b@gmail.com" }, // free domain: not a domain duplicate
        { email: "x@blocked.com" },
      ],
      [{ email: "old@existing.com" }],
      buildDnc(["blocked.com"]),
    );
    expect(res.map((r) => r.status)).toEqual(["valid", "invalid", "duplicate", "duplicate", "duplicate", "valid", "valid", "dnc"]);
    expect(res[3].reason).toBe("same_domain");
  });
});

describe("import dedup options", () => {
  const rows = [{ email: "sales@acme.com" }, { email: "ceo@acme.com" }, { email: "old@existing.com" }, { email: "x@blocked.com" }, { email: "sales@acme.com" }];
  const existing = [{ email: "old@existing.com" }];
  const dnc = buildDnc(["blocked.com"]);
  it("default: same domain and existing contacts are duplicates", () => {
    expect(classifyImport(rows, existing, dnc).map((r) => r.status)).toEqual(["valid", "duplicate", "duplicate", "dnc", "duplicate"]);
  });
  it("allowSameDomain: several people per company, same email still duplicate", () => {
    expect(classifyImport(rows, existing, dnc, { allowSameDomain: true }).map((r) => r.status)).toEqual(["valid", "valid", "duplicate", "dnc", "duplicate"]);
  });
  it("allowResend: people emailed before can be imported again; DNC is never overridden", () => {
    const r = classifyImport(rows, existing, dnc, { allowResend: true, allowSameDomain: true });
    expect(r.map((x) => x.status)).toEqual(["valid", "valid", "valid", "dnc", "duplicate"]);
    expect(r[2].reason).toBe("resend");
  });
});

describe("attachments", async () => {
  const { directUrl, parseAttachments, formatAttachments } = await import("@/lib/attachments");
  it("parses 'name | url' lines and ignores non-links", () => {
    expect(parseAttachments("بروفايل الشركة.pdf | https://x.co/p.pdf\nhttps://y.co/a.png\nnot a link")).toEqual([
      { name: "بروفايل الشركة.pdf", url: "https://x.co/p.pdf" },
      { url: "https://y.co/a.png" },
    ]);
    expect(formatAttachments([{ name: "A", url: "https://a" }, { url: "https://b" }])).toBe("A | https://a\nhttps://b");
  });
  it("turns share links into direct downloads", () => {
    expect(directUrl("https://drive.google.com/file/d/1AbC-d_9/view?usp=sharing")).toBe("https://drive.google.com/uc?export=download&id=1AbC-d_9");
    expect(directUrl("https://drive.google.com/open?id=XYZ")).toBe("https://drive.google.com/uc?export=download&id=XYZ");
    expect(directUrl("https://docs.google.com/document/d/DOC1/edit")).toBe("https://docs.google.com/document/d/DOC1/export?format=pdf");
    expect(directUrl("https://www.dropbox.com/s/k/file.pdf?dl=0")).toBe("https://www.dropbox.com/s/k/file.pdf?dl=1");
    expect(directUrl("https://site.com/f.pdf")).toBe("https://site.com/f.pdf");
  });
});
