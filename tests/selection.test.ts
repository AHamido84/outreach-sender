import { describe, expect, it } from "vitest";
import { buildDnc } from "@/lib/emails";
import { chooseTemplate, parseFilter, formatFilter, selectContacts, type Template } from "@/lib/selection";
import type { Row } from "@/lib/table";
import { dayKey, inWindow, nextWindowOpen, pacedAllowance, parseDays, type SendWindow } from "@/lib/time";

const T = (o: Partial<Template>): Template => ({
  id: "t", name: "", language: "AR", step: 0, delayDays: 3, subject: "s", body: "b", version: "A", active: true, ...o,
});
const templates = [
  T({ id: "a0", version: "A" }),
  T({ id: "b0", version: "B" }),
  T({ id: "a1", step: 1, version: "A" }),
  T({ id: "b1", step: 1, version: "B" }),
  T({ id: "en0", language: "EN" }),
  T({ id: "off", language: "EN", step: 1, active: false }),
];
let n = 2;
const C = (o: Record<string, string>): Row => ({ _row: n++, ID: `C${n}`, Email: `c${n}@acme${n}.com`, Status: "Ready", Language: "AR", ...o });
const now = new Date("2026-11-22T08:00:00Z"); // Sunday 10:00 in Cairo

describe("contact selection", () => {
  it("puts due follow-ups first (oldest due first), then new contacts", () => {
    const ready = C({ ID: "R1" });
    const fuLate = C({ ID: "F2", Status: "Sent", Step: "0", Version: "A", "Next Send At": "2026-11-21T00:00:00Z" });
    const fuEarly = C({ ID: "F1", Status: "Sent", Step: "0", Version: "B", "Next Send At": "2026-11-20T00:00:00Z" });
    const notDue = C({ ID: "F3", Status: "Sent", Step: "0", "Next Send At": "2026-12-01T00:00:00Z" });
    const { picks } = selectContacts({ contacts: [ready, fuLate, fuEarly, notDue], templates, dnc: buildDnc([]), now, max: 10, mode: "manual" });
    expect(picks.map((p) => p.contact.ID)).toEqual(["F1", "F2", "R1"]);
    expect(picks[0].template.id).toBe("b1"); // keeps version B for the follow-up
    expect(picks[0].step).toBe(1);
  });
  it("respects max, DNC, invalid email and stop statuses", () => {
    const list = [
      C({ ID: "A" }),
      C({ ID: "B", Email: "x@blocked.com" }),
      C({ ID: "C", Email: "bad" }),
      C({ ID: "D", Status: "Replied" }),
      C({ ID: "E", Status: "Duplicate" }),
      C({ ID: "F" }),
      C({ ID: "G" }),
    ];
    const { picks } = selectContacts({ contacts: list, templates, dnc: buildDnc(["blocked.com"]), now, max: 2, mode: "manual" });
    expect(picks.map((p) => p.contact.ID)).toEqual(["A", "F"]);
  });
  it("auto mode sends only Ready, manual also New", () => {
    const list = [C({ ID: "N", Status: "New" }), C({ ID: "R", Status: "Ready" })];
    expect(selectContacts({ contacts: list, templates, dnc: buildDnc([]), now, max: 5, mode: "auto" }).picks.map((p) => p.contact.ID)).toEqual(["R"]);
    expect(selectContacts({ contacts: list, templates, dnc: buildDnc([]), now, max: 5, mode: "manual" }).picks).toHaveLength(2);
  });
  it("chooses the language's template and skips when none", () => {
    const en = C({ ID: "E1", Language: "English" });
    expect(chooseTemplate(templates, en, 0)?.id).toBe("en0");
    expect(chooseTemplate(templates, en, 1)).toBeNull(); // inactive
  });
  it("A/B is stable by contact ID", () => {
    const c = C({ ID: "STABLE" });
    const v1 = chooseTemplate(templates, c, 0)?.version;
    for (let i = 0; i < 5; i++) expect(chooseTemplate(templates, c, 0)?.version).toBe(v1);
    const versions = new Set(Array.from({ length: 40 }, (_, i) => chooseTemplate(templates, C({ ID: "X" + i }), 0)?.version));
    expect(versions).toEqual(new Set(["A", "B"]));
  });
  it("filters by tags, language and IDs", () => {
    const list = [C({ ID: "T1", Tags: "vip, cairo" }), C({ ID: "T2", Tags: "cold" }), C({ ID: "T3", Language: "EN", Tags: "vip" })];
    const f = parseFilter("tags:VIP; language:AR");
    expect(selectContacts({ contacts: list, templates, dnc: buildDnc([]), now, max: 9, mode: "manual", filter: f }).picks.map((p) => p.contact.ID)).toEqual(["T1"]);
    expect(formatFilter(f)).toBe("tags:VIP; language:AR");
    const byId = selectContacts({ contacts: list, templates, dnc: buildDnc([]), now, max: 9, mode: "manual", filter: { ids: ["T3", "T2"] } });
    expect(byId.picks.map((p) => p.contact.ID)).toEqual(["T3", "T2"]);
  });
});

describe("send window, timezone and pacing", () => {
  const w: SendWindow = { days: parseDays("Sun,Mon,Tue,Wed,Thu"), start: 9, end: 13, tz: "Africa/Cairo" };
  it("parses English and Arabic day names", () => {
    expect(parseDays("الأحد، الاثنين, fri")).toEqual(["Sun", "Mon", "Fri"]);
  });
  it("checks the window in the company timezone", () => {
    expect(inWindow(new Date("2026-11-22T07:00:00Z"), w)).toBe(true); // 09:00 Cairo, Sunday
    expect(inWindow(new Date("2026-11-22T06:59:00Z"), w)).toBe(false); // 08:59
    expect(inWindow(new Date("2026-11-22T11:00:00Z"), w)).toBe(false); // 13:00 end exclusive
    expect(inWindow(new Date("2026-11-21T08:00:00Z"), w)).toBe(false); // Saturday
    expect(inWindow(new Date("2026-11-22T07:00:00Z"), { ...w, tz: "Asia/Tokyo" })).toBe(false); // 16:00 Tokyo
  });
  it("computes the day key in the timezone", () => {
    expect(dayKey(new Date("2026-11-21T23:30:00Z"), "Africa/Cairo")).toBe("2026-11-22");
    expect(dayKey(new Date("2026-11-21T23:30:00Z"), "UTC")).toBe("2026-11-21");
  });
  it("finds the next window opening", () => {
    const sat = new Date("2026-11-21T10:00:00Z");
    expect(nextWindowOpen(sat, w)?.toISOString()).toBe("2026-11-22T07:00:00.000Z");
  });
  it("spreads the daily limit across the window", () => {
    // 30/day over 240 minutes → one every 8 minutes.
    const at = (iso: string, sentToday: number) => pacedAllowance({ now: new Date(iso), w, dailyLimit: 30, sentToday, perRun: 5 });
    expect(at("2026-11-22T07:00:00Z", 0)).toBe(1); // window opens
    expect(at("2026-11-22T07:40:00Z", 1)).toBe(5); // behind: 6 expected, capped by per run
    expect(at("2026-11-22T07:40:00Z", 6)).toBe(0); // on pace
    expect(at("2026-11-22T10:59:00Z", 28)).toBe(2); // end of day catches up
    expect(at("2026-11-22T10:59:00Z", 30)).toBe(0); // daily limit reached
    expect(at("2026-11-22T12:00:00Z", 0)).toBe(0); // outside window
  });
});

describe("same address in several rows", () => {
  it("sends at most one email per address per run", () => {
    const a = C({ ID: "D1", Email: "same@x.com" });
    const b = C({ ID: "D2", Email: "Same@x.com" });
    const { picks } = selectContacts({ contacts: [a, b], templates, dnc: buildDnc([]), now, max: 5, mode: "manual" });
    expect(picks.map((p) => p.contact.ID)).toEqual(["D1"]);
  });
});
