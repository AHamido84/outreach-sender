import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { cronSecret } from "@/lib/env";
import { runCron } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = cronSecret();
  if (!expected || !safeEqual(key, expected)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const result = await runCron(50_000);
  return NextResponse.json({ ok: true, ...result });
}

export const GET = handle;
export const POST = handle;
