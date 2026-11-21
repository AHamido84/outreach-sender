"use client";
import { TextAlign } from "@tiptap/extension-text-align";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Eraser, Highlighter, Italic, Link2, List, ListOrdered, Palette, Redo2, Strikethrough,
  Underline as UnderlineIcon, Undo2, Unlink,
} from "lucide-react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ar } from "@/content/ar";
import { isHtmlBody, plainToHtml } from "@/lib/template";
import { cn } from "@/lib/utils";

export type RichEditorHandle = { insertText: (text: string) => void };

// Email-safe fonts, plus Cairo (a web font: shown where the mail app loads web fonts, otherwise falls back to Tahoma).
const FONTS: [string, string][] = [
  ["", ar.editor.defaultFont], ["Cairo, Tahoma, sans-serif", "Cairo"], ["Tahoma, sans-serif", "Tahoma"], ["Arial, sans-serif", "Arial"], ["Verdana, sans-serif", "Verdana"],
  ["'Trebuchet MS', sans-serif", "Trebuchet MS"], ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times New Roman"],
  ["'Courier New', monospace", "Courier New"],
];
const SIZES = ["", "12px", "14px", "16px", "18px", "22px", "28px"];
const COLORS = ["#111111", "#475569", "#0f766e", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e5e7eb"];

function Tool({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn("inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40", on && "bg-primary/10 text-primary")}
    >
      {children}
    </button>
  );
}

function Swatches({ colors, onPick, onClear, custom }: { colors: string[]; onPick: (c: string) => void; onClear: () => void; custom?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-5 gap-1.5">
        {colors.map((c) => (
          <button key={c} type="button" aria-label={c} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(c)} className="size-6 rounded-full ring-1 ring-black/10" style={{ background: c }} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        {custom && <input type="color" aria-label={ar.editor.customColor} className="h-7 w-10 cursor-pointer rounded border" onChange={(e) => onPick(e.target.value)} />}
        <Button type="button" size="xs" variant="ghost" onClick={onClear}>{ar.editor.noColor}</Button>
      </div>
    </div>
  );
}

function LinkTool({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const onOpen = (o: boolean) => {
    if (o) {
      const { from, to } = editor.state.selection;
      setText(editor.state.doc.textBetween(from, to, " "));
      setUrl(editor.getAttributes("link").href || "");
    }
    setOpen(o);
  };
  const apply = () => {
    let href = url.trim();
    if (!href) return;
    if (!/^(https?:|mailto:|tel:|\{)/i.test(href)) href = `https://${href}`;
    const { from, to } = editor.state.selection;
    const selected = editor.state.doc.textBetween(from, to, " ");
    const label = text.trim() || selected || href;
    if (from !== to && label === selected) {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    } else {
      editor.chain().focus().insertContent({ type: "text", text: label, marks: [{ type: "link", attrs: { href } }] }).run();
    }
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={onOpen}>
      <PopoverTrigger asChild>
        <button type="button" title={ar.editor.link} aria-label={ar.editor.link} onMouseDown={(e) => e.preventDefault()}
          className={cn("inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", editor.isActive("link") && "bg-primary/10 text-primary")}>
          <Link2 className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        <div className="space-y-1">
          <Label htmlFor="lt">{ar.editor.linkText}</Label>
          <Input id="lt" value={text} onChange={(e) => setText(e.target.value)} placeholder={ar.editor.linkTextPh} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="lu">{ar.editor.linkUrl}</Label>
          <Input id="lu" dir="ltr" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://… أو {booking_link}" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), apply())} />
          <p className="text-xs text-muted-foreground">{ar.editor.linkHint}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={apply} disabled={!url.trim()}>{ar.common.apply}</Button>
          {editor.isActive("link") && (
            <Button type="button" size="sm" variant="ghost" onClick={() => { editor.chain().focus().extendMarkRange("link").unsetLink().run(); setOpen(false); }}>
              <Unlink />{ar.editor.unlink}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const RichEditor = forwardRef<RichEditorHandle, { value: string; onChange: (html: string) => void; dir: "rtl" | "ltr"; onFocus?: () => void }>(
  function RichEditor({ value, onChange, dir, onFocus }, ref) {
    const editor = useEditor({
      immediatelyRender: false,
      shouldRerenderOnTransaction: true, // keep toolbar state (active buttons, font, size) in sync
      extensions: [
        StarterKit.configure({
          code: false,
          codeBlock: false,
          heading: { levels: [2, 3] },
          link: {
            openOnClick: false,
            autolink: true,
            defaultProtocol: "https",
            // Allow template variables as link targets, e.g. {booking_link}
            isAllowedUri: (url, ctx) => /^\{[\w ]+\}$/.test(url) || ctx.defaultValidate(url),
          },
        }),
        TextStyleKit.configure({ lineHeight: false }),
        TextAlign.configure({ types: ["paragraph", "heading"] }),
      ],
      content: isHtmlBody(value) ? value : plainToHtml(value),
      editorProps: { attributes: { class: "rich-editor min-h-64 px-3 py-2.5 text-sm leading-relaxed outline-none", dir } },
      onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
      onFocus: () => onFocus?.(),
    });

    useImperativeHandle(ref, () => ({
      insertText: (text: string) => editor?.chain().focus().insertContent(text).run(),
    }), [editor]);

    if (!editor) return <div className="min-h-72 rounded-lg border bg-muted/30" />;
    const ts = editor.getAttributes("textStyle");
    const st = {
      bold: editor.isActive("bold"), italic: editor.isActive("italic"), underline: editor.isActive("underline"), strike: editor.isActive("strike"),
      bullet: editor.isActive("bulletList"), ordered: editor.isActive("orderedList"),
      right: editor.isActive({ textAlign: "right" }), center: editor.isActive({ textAlign: "center" }), left: editor.isActive({ textAlign: "left" }),
      font: (ts.fontFamily as string) || "", size: (ts.fontSize as string) || "", color: (ts.color as string) || "",
      canUndo: editor.can().undo(), canRedo: editor.can().redo(),
    };
    const c = () => editor.chain().focus();

    return (
      <div className="overflow-hidden rounded-lg border bg-background focus-within:ring-3 focus-within:ring-ring/50">
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1" dir="rtl">
          <select aria-label={ar.editor.font} title={ar.editor.font} value={st.font} onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
            className="h-7 max-w-32 rounded-md border bg-background px-1 text-xs">
            {FONTS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
          </select>
          <select aria-label={ar.editor.size} title={ar.editor.size} value={st.size} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}
            className="h-7 rounded-md border bg-background px-1 text-xs">
            {SIZES.map((s) => <option key={s} value={s}>{s ? s.replace("px", "") : ar.editor.defaultSize}</option>)}
          </select>
          <span className="mx-1 h-5 w-px bg-border" />
          <Tool title={ar.editor.bold} on={st.bold} onClick={() => c().toggleBold().run()}><Bold className="size-4" /></Tool>
          <Tool title={ar.editor.italic} on={st.italic} onClick={() => c().toggleItalic().run()}><Italic className="size-4" /></Tool>
          <Tool title={ar.editor.underline} on={st.underline} onClick={() => c().toggleUnderline().run()}><UnderlineIcon className="size-4" /></Tool>
          <Tool title={ar.editor.strike} on={st.strike} onClick={() => c().toggleStrike().run()}><Strikethrough className="size-4" /></Tool>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" title={ar.editor.color} aria-label={ar.editor.color} onMouseDown={(e) => e.preventDefault()} className="inline-flex size-7 flex-col items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <Palette className="size-4" />
                <span className="mt-0.5 h-0.5 w-4 rounded" style={{ background: st.color || "currentColor" }} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto" align="start">
              <Swatches colors={COLORS} custom onPick={(col) => c().setColor(col).run()} onClear={() => c().unsetColor().run()} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" title={ar.editor.highlight} aria-label={ar.editor.highlight} onMouseDown={(e) => e.preventDefault()} className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                <Highlighter className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto" align="start">
              <Swatches colors={HIGHLIGHTS} custom onPick={(col) => c().setBackgroundColor(col).run()} onClear={() => c().unsetBackgroundColor().run()} />
            </PopoverContent>
          </Popover>
          <LinkTool editor={editor} />
          <span className="mx-1 h-5 w-px bg-border" />
          <Tool title={ar.editor.alignRight} on={st.right} onClick={() => c().setTextAlign("right").run()}><AlignRight className="size-4" /></Tool>
          <Tool title={ar.editor.alignCenter} on={st.center} onClick={() => c().setTextAlign("center").run()}><AlignCenter className="size-4" /></Tool>
          <Tool title={ar.editor.alignLeft} on={st.left} onClick={() => c().setTextAlign("left").run()}><AlignLeft className="size-4" /></Tool>
          <Tool title={ar.editor.bullets} on={st.bullet} onClick={() => c().toggleBulletList().run()}><List className="size-4" /></Tool>
          <Tool title={ar.editor.numbers} on={st.ordered} onClick={() => c().toggleOrderedList().run()}><ListOrdered className="size-4" /></Tool>
          <span className="mx-1 h-5 w-px bg-border" />
          <Tool title={ar.editor.clear} onClick={() => c().unsetAllMarks().unsetTextAlign().run()}><Eraser className="size-4" /></Tool>
          <Tool title={ar.editor.undo} disabled={!st.canUndo} onClick={() => c().undo().run()}><Undo2 className="size-4" /></Tool>
          <Tool title={ar.editor.redo} disabled={!st.canRedo} onClick={() => c().redo().run()}><Redo2 className="size-4" /></Tool>
        </div>
        <EditorContent editor={editor} />
      </div>
    );
  },
);
