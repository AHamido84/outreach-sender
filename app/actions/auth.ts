"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeEqual } from "@/lib/crypto";
import { appPassword, appSecret } from "@/lib/env";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

const attempts = new Map<string, { n: number; at: number }>();

export async function login(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const pw = String(form.get("password") || "");
  const next = String(form.get("next") || "/");
  const key = "global";
  const a = attempts.get(key);
  if (a && a.n >= 10 && Date.now() - a.at < 60_000) return { error: "rate" };
  if (!safeEqual(pw, appPassword())) {
    attempts.set(key, { n: (a && Date.now() - a.at < 60_000 ? a.n : 0) + 1, at: Date.now() });
    await new Promise((r) => setTimeout(r, 600));
    return { error: "wrong" };
  }
  attempts.delete(key);
  const token = await createSessionToken(appSecret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400,
  });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
