"use client";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettings } from "@/app/actions/settings";
import { Section } from "@/components/app/bits";
import { errorMessage } from "@/components/app/error-box";
import { RichEditor, type RichEditorHandle } from "@/components/app/rich-editor";
import { SocialLinks } from "@/components/app/social-links";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ar } from "@/content/ar";
import { isHtmlBody, plainToHtml } from "@/lib/template";

export function SignatureSection({ id, signature, append, logoUrl, baseUrl }: { id: string; signature: string; append: boolean; logoUrl?: string; baseUrl?: string }) {
  const router = useRouter();
  const [html, setHtml] = useState(isHtmlBody(signature) ? signature : plainToHtml(signature));
  const [auto, setAuto] = useState(append);
  const [pending, start] = useTransition();
  const editorRef = useRef<RichEditorHandle>(null);
  const dirty = html !== (isHtmlBody(signature) ? signature : plainToHtml(signature)) || auto !== append;
  const save = () =>
    start(async () => {
      const r = await saveSettings(id, "Company", { Signature: html, "Append Signature": auto ? "yes" : "no" });
      if (!r.ok) return void toast.error(errorMessage(r.error));
      toast.success(ar.signature.saved);
      router.refresh();
    });
  return (
    <Section title={ar.signature.title}>
      <p className="mb-3 text-sm text-muted-foreground">{ar.signature.hint}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <RichEditor ref={editorRef} value={html} onChange={setHtml} dir="rtl" logoUrl={logoUrl} minHeight="min-h-40" />
          <SocialLinks baseUrl={baseUrl} onInsert={(row) => editorRef.current?.insertHtml(row)} />
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="mb-2 text-xs text-muted-foreground">{ar.signature.preview}</p>
          {/* The signature is the user's own content from their sheet. */}
          <div className="rich-editor text-sm leading-relaxed" dir="rtl" style={{ fontFamily: "Tahoma, Arial, sans-serif" }} dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
      {!logoUrl && <p className="mt-2 text-xs text-muted-foreground">{ar.signature.noLogo}</p>}
      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
        <Switch checked={auto} onCheckedChange={setAuto} />
        {ar.signature.append}
      </label>
      <Button className="mt-4" onClick={save} disabled={pending || !dirty}>{pending ? <Loader2 className="animate-spin" /> : <Save />}{ar.common.save}</Button>
    </Section>
  );
}
