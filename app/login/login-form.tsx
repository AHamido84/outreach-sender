"use client";
import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ar } from "@/content/ar";

export function LoginForm({ next, demo }: { next: string; demo: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card>
      <CardContent>
        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div className="space-y-2">
            <Label htmlFor="password">{ar.login.password}</Label>
            <Input id="password" name="password" type="password" autoFocus required autoComplete="current-password" />
            <p className="text-xs text-muted-foreground">{demo ? ar.login.demoHint : ar.login.hint}</p>
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error === "rate" ? "محاولات كثيرة — انتظر دقيقة" : ar.login.wrong}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={pending}>
            {pending ? ar.common.loading : ar.login.submit}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
