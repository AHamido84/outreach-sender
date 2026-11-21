import { loadCompany, logActivity } from "./company";
import { verifyUnsubscribeToken } from "./crypto";
import { TABS } from "./schema";
import { get } from "./table";

/** Mark the contact Unsubscribed and add the email to Do Not Contact. */
export async function unsubscribeEmail(token: string): Promise<boolean> {
  const data = verifyUnsubscribeToken(token);
  if (!data) return false;
  const ctx = await loadCompany(data.companyId);
  const email = data.email.toLowerCase();
  for (const c of ctx.t[TABS.contacts].rows.filter((r) => get(r, "Email").toLowerCase() === email)) {
    ctx.w.update(ctx.t[TABS.contacts], c, { Status: "Unsubscribed", "Next Send At": "" });
  }
  const dnc = ctx.t[TABS.dnc];
  if (!dnc.rows.some((r) => get(r, "Email or Domain").toLowerCase() === email)) {
    ctx.w.append(dnc, { "Email or Domain": email, Reason: "Unsubscribe link", "Added At": new Date().toISOString() });
  }
  await ctx.w.flush();
  await logActivity(ctx, "Unsubscribed (link)", email);
  return true;
}
