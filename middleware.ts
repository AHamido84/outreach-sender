import { NextResponse, type NextRequest } from "next/server";
import { appSecret } from "@/lib/env";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC = [/^\/login/, /^\/api\/cron/, /^\/api\/unsubscribe\//, /^\/u\//, /^\/social\//, /^\/_next\//, /^\/favicon/, /^\/icon/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  let ok = false;
  try {
    ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, appSecret());
  } catch {
    ok = false;
  }
  if (ok) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
