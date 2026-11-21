import { LoginForm } from "./login-form";
import { ar } from "@/content/ar";
import { isDemo } from "@/lib/env";
import { Send } from "lucide-react";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Send className="size-6 -scale-x-100" />
          </div>
          <h1 className="text-2xl font-bold">{ar.app.name}</h1>
          <p className="text-sm text-muted-foreground">{ar.app.tagline}</p>
        </div>
        <LoginForm next={next || "/"} demo={isDemo()} />
      </div>
    </main>
  );
}
