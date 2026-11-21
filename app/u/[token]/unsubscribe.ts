"use server";
import { redirect } from "next/navigation";
import { unsubscribeEmail } from "@/lib/unsubscribe";

export async function unsubscribe(token: string) {
  await unsubscribeEmail(token);
  redirect(`/u/${token}?done=1`);
}
