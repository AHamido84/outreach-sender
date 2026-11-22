import { describe, expect, it } from "vitest";
import { columnValue, countryFromPhone } from "@/lib/monday-values";

describe("monday column values", () => {
  it("derives the phone country from the dialing code, or skips the column", () => {
    expect(countryFromPhone("+966501234567")).toBe("SA");
    expect(countryFromPhone("+201001234567")).toBe("EG");
    expect(countryFromPhone("+971501234567")).toBe("AE");
    expect(columnValue("phone", "00966 50 123 4567")).toEqual({ phone: "+966501234567", countryShortName: "SA" });
    expect(columnValue("phone", "0501234567")).toBeNull(); // local number: monday needs a country
  });
  it("formats other column types", () => {
    expect(columnValue("status", "Sent")).toEqual({ label: "Sent" });
    expect(columnValue("email", "a@b.co")).toEqual({ email: "a@b.co", text: "a@b.co" });
    expect(columnValue("link", "acme.com")).toEqual({ url: "https://acme.com", text: "acme.com" });
    expect(columnValue("date", "2026-11-22T10:30:00.000Z")).toEqual({ date: "2026-11-22", time: "10:30:00" });
    expect(columnValue("numbers", "x")).toBeNull();
  });
});
