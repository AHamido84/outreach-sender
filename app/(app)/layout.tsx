import { LogOut, Send } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { ar } from "@/content/ar";
import { isDemo } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Send className="size-4 -scale-x-100" />
            </span>
            <span>{ar.app.name}</span>
          </Link>
          {isDemo() && (
            <span title={ar.common.demoHint} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
              {ar.common.demo}
            </span>
          )}
          <div className="ms-auto">
            <form action={logout}>
              <Button variant="ghost" size="sm" type="submit">
                <LogOut />
                <span className="hidden sm:inline">{ar.common.logout}</span>
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-6">{children}</main>
    </div>
  );
}
