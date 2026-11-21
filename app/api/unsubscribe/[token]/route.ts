import { NextResponse } from "next/server";
import { unsubscribeEmail } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

// RFC 8058 one-click unsubscribe (List-Unsubscribe-Post).
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await unsubscribeEmail(token).catch(() => false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
