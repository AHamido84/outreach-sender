import { describe, expect, it } from "vitest";
import { classifyInbound, isUnsubscribe, stripQuoted, type InboundMessage } from "@/lib/detect";
import type { Row } from "@/lib/table";

const contacts: Row[] = [
  { _row: 2, ID: "C1", Email: "ali@acme.com", "Last Sent At": "2026-11-20T10:00:00Z", "Last Message ID": "<m2@os>", "Thread References": "<m1@os> <m2@os>" },
  { _row: 3, ID: "C2", Email: "sara@beta.io", "Last Sent At": "2026-11-20T10:00:00Z", "Last Message ID": "<m3@os>", "Thread References": "<m3@os>" },
  { _row: 4, ID: "C3", Email: "never@sent.com", "Last Sent At": "" },
];
const M = (o: Partial<InboundMessage>): InboundMessage => ({ uid: 1, from: "x@y.com", subject: "Re: hi", references: [], text: "", headers: {}, ...o });

describe("reply / bounce detection", () => {
  it("matches replies by In-Reply-To / References", () => {
    const r = classifyInbound(M({ from: "other@acme.com", inReplyTo: "<M1@os>", text: "Sounds good, call me" }), contacts);
    expect(r.kind).toBe("reply");
    expect(r.contact?.ID).toBe("C1");
  });
  it("falls back to the sender address (only contacts we emailed)", () => {
    expect(classifyInbound(M({ from: "Sara@Beta.io", text: "مهتم" }), contacts).contact?.ID).toBe("C2");
    expect(classifyInbound(M({ from: "never@sent.com", text: "hi" }), contacts).kind).toBe("ignore");
  });
  it("detects DSN bounces and the failed recipient", () => {
    const r = classifyInbound(
      M({
        from: "mailer-daemon@googlemail.com",
        subject: "Delivery Status Notification (Failure)",
        contentType: "multipart/report; report-type=delivery-status",
        text: "Final-Recipient: rfc822; sara@beta.io\nStatus: 5.1.1",
      }),
      contacts,
    );
    expect(r.kind).toBe("bounce");
    expect(r.contact?.ID).toBe("C2");
  });
  it("detects bounces via X-Failed-Recipients", () => {
    const r = classifyInbound(M({ from: "postmaster@x.com", subject: "Undeliverable", headers: { "x-failed-recipients": "ali@acme.com" } }), contacts);
    expect(r.kind).toBe("bounce");
    expect(r.contact?.ID).toBe("C1");
  });
  it("detects unsubscribe replies (Arabic and English), but not normal replies", () => {
    expect(isUnsubscribe("لا")).toBe(true);
    expect(isUnsubscribe("لا، شكراً")).toBe(true);
    expect(isUnsubscribe("No.\n\nOn Mon, Ahmed wrote:\n> hello")).toBe(true);
    expect(isUnsubscribe("STOP")).toBe(true);
    expect(isUnsubscribe("Please unsubscribe me")).toBe(true);
    expect(isUnsubscribe("No problem, let's schedule a call next week")).toBe(false);
    expect(isUnsubscribe("لا مانع من مكالمة الأسبوع القادم")).toBe(false);
    const r = classifyInbound(M({ from: "ali@acme.com", text: "unsubscribe" }), contacts);
    expect(r.kind).toBe("unsubscribe");
  });
  it("ignores auto-replies", () => {
    const r = classifyInbound(M({ from: "ali@acme.com", subject: "Automatic reply: hi", headers: { "auto-submitted": "auto-replied" } }), contacts);
    expect(r.kind).toBe("auto");
  });
  it("strips quoted text", () => {
    expect(stripQuoted("yes\n> old\nOn Tue, X wrote:\nmore")).toBe("yes");
  });
});
