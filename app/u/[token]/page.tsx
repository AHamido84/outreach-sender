import { CheckCircle2, MailX } from "lucide-react";
import { verifyUnsubscribeToken } from "@/lib/crypto";
import { unsubscribe } from "./unsubscribe";

export const dynamic = "force-dynamic";

// Public page (no login): confirm the unsubscribe. Mail clients use the one-click POST in route-less form below.
export default async function UnsubPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const data = verifyUnsubscribeToken(token);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center">
        {!data ? (
          <p className="text-muted-foreground">الرابط غير صالح.</p>
        ) : done ? (
          <>
            <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
            <h1 className="text-lg font-semibold">تم إلغاء الاشتراك</h1>
            <p className="text-sm text-muted-foreground">لن نرسل رسائل أخرى إلى <span className="ltr font-mono">{data.email}</span>. You have been unsubscribed.</p>
          </>
        ) : (
          <>
            <MailX className="mx-auto size-10 text-muted-foreground" />
            <h1 className="text-lg font-semibold">إلغاء الاشتراك · Unsubscribe</h1>
            <p className="ltr font-mono text-sm">{data.email}</p>
            <form action={unsubscribe.bind(null, token)}>
              <button className="h-10 w-full rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">تأكيد · Confirm</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
