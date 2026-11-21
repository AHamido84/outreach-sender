"use client";
import { Inbox, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { checkInboxNow } from "@/app/actions/send";
import { errorMessage } from "@/components/app/error-box";
import { Button } from "@/components/ui/button";
import { ar } from "@/content/ar";

export function CheckInboxButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await checkInboxNow(id);
          if (!r.ok) return void toast.error(errorMessage(r.error));
          if (r.data.skipped) toast.info(ar.warnings.imap_not_configured as string);
          else toast.success(ar.dashboard.inboxResult(r.data));
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Inbox />}
      {ar.dashboard.checkInbox}
    </Button>
  );
}
