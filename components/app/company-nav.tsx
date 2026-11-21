"use client";
import { Activity, LayoutDashboard, Mail, Send, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ar } from "@/content/ar";
import { cn } from "@/lib/utils";

export function CompanyNav({ id }: { id: string }) {
  const path = usePathname();
  const base = `/c/${id}`;
  const items = [
    { href: base, label: ar.nav.dashboard, icon: LayoutDashboard, exact: true },
    { href: `${base}/contacts`, label: ar.nav.contacts, icon: Users },
    { href: `${base}/templates`, label: ar.nav.templates, icon: Mail },
    { href: `${base}/send`, label: ar.nav.send, icon: Send },
    { href: `${base}/settings`, label: ar.nav.settings, icon: Settings },
    { href: `${base}/activity`, label: ar.nav.activity, icon: Activity },
  ];
  return (
    <nav className="-mx-4 overflow-x-auto border-b px-4">
      <ul className="flex min-w-max gap-1">
        {items.map((it) => {
          const active = it.exact ? path === it.href : path.startsWith(it.href);
          return (
            <li key={it.href}>
              <Link
                href={it.href}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition",
                  active ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <it.icon className="size-4" />
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
