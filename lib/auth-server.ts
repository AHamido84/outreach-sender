import { cookies } from "next/headers";
import { appSecret } from "./env";
import { AppError } from "./errors";
import { SESSION_COOKIE, verifySessionToken } from "./session";

export async function requireSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token, appSecret()))) throw new AppError("unauthorized");
}
