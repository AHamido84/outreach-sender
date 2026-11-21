import { describe, expect, it } from "vitest";
import { decrypt, encrypt, isEncrypted, maskSecret, unsubscribeToken, verifyUnsubscribeToken } from "@/lib/crypto";
import { createSessionToken, verifySessionToken } from "@/lib/session";

const S = "test-secret-0123456789abcdef";

describe("encryption helpers", () => {
  it("round-trips and marks values", () => {
    const e = encrypt("my-app-password", S);
    expect(isEncrypted(e)).toBe(true);
    expect(e).not.toContain("my-app-password");
    expect(decrypt(e, S)).toBe("my-app-password");
  });
  it("uses a random IV", () => {
    expect(encrypt("x", S)).not.toBe(encrypt("x", S));
  });
  it("accepts plain values typed in the sheet", () => {
    expect(decrypt("plain-value", S)).toBe("plain-value");
    expect(isEncrypted("plain-value")).toBe(false);
  });
  it("fails with the wrong secret or tampered data", () => {
    const e = encrypt("secret", S);
    expect(() => decrypt(e, "another-secret-0123456789")).toThrow();
    const tampered = e.slice(0, -2) + (e.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered, S)).toThrow();
  });
  it("masks to last 4 only", () => {
    expect(maskSecret(encrypt("abcd1234", S), S)).toEqual({ set: true, last4: "1234" });
    expect(maskSecret("", S)).toEqual({ set: false, last4: "" });
  });
  it("signs unsubscribe tokens", () => {
    const t = unsubscribeToken("sheet1", "a@b.com", S);
    expect(verifyUnsubscribeToken(t, S)).toEqual({ companyId: "sheet1", email: "a@b.com" });
    expect(verifyUnsubscribeToken(t + "x", S)).toBeNull();
  });
  it("signs and verifies sessions", async () => {
    const t = await createSessionToken(S, 1000);
    expect(await verifySessionToken(t, S, 2000)).toBe(true);
    expect(await verifySessionToken(t, "wrong-secret-0123456789", 2000)).toBe(false);
    expect(await verifySessionToken(t, S, 1000 + 31 * 86400_000)).toBe(false);
    expect(await verifySessionToken("123.abc", S, 0)).toBe(false);
  });
});
