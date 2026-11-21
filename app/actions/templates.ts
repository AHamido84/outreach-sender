"use server";
import { revalidatePath } from "next/cache";
import { getMailer } from "@/lib/adapters";
import { act } from "@/lib/action";
import { requireSession } from "@/lib/auth-server";
import { loadCompany, logActivity, senderSettings } from "@/lib/company";
import { domainOf } from "@/lib/emails";
import { composeFor } from "@/lib/engine";
import { AppError } from "@/lib/errors";
import { TABS } from "@/lib/schema";
import type { Template } from "@/lib/selection";
import { getStore } from "@/lib/sheets";
import { get, type Row } from "@/lib/table";
import { normalizeLanguage } from "@/lib/template";

export type TemplateDraft = {
  id?: string;
  name: string;
  language: string;
  step: number;
  delayDays: number;
  subject: string;
  body: string;
  version: string;
  active: boolean;
};

function toTpl(d: TemplateDraft): Template {
  return {
    id: d.id || "draft", name: d.name, language: normalizeLanguage(d.language), step: Number(d.step) || 0, delayDays: Number(d.delayDays) || 0,
    subject: d.subject, body: d.body, version: (d.version || "A").toUpperCase(), active: d.active,
  };
}

export async function saveTemplate(id: string, d: TemplateDraft) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const t = ctx.t[TABS.templates];
    const values = {
      Name: d.name.trim(), Language: normalizeLanguage(d.language), Step: String(Math.max(0, Math.round(Number(d.step) || 0))),
      "Delay Days": String(Math.max(0, Number(d.delayDays) || 0)), Subject: d.subject, Body: d.body,
      Version: (d.version || "A").trim().toUpperCase().slice(0, 3), Active: d.active ? "yes" : "no",
    };
    let tid = d.id;
    const row = tid ? t.rows.find((r) => get(r, "Template ID") === tid) : undefined;
    if (row) ctx.w.update(t, row, values);
    else {
      let max = 0;
      for (const r of t.rows) {
        const m = get(r, "Template ID").match(/^T(\d+)$/);
        if (m) max = Math.max(max, Number(m[1]));
      }
      tid = `T${max + 1}`;
      ctx.w.append(t, { "Template ID": tid, ...values });
    }
    await ctx.w.flush();
    await logActivity(ctx, row ? "Template edited" : "Template added", `${tid} ${values.Name} (${values.Language} step ${values.Step} ${values.Version})`);
    revalidatePath(`/c/${id}`, "layout");
    return { id: tid! };
  });
}

export async function deleteTemplate(id: string, templateId: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const row = ctx.t[TABS.templates].rows.find((r) => get(r, "Template ID") === templateId);
    if (!row) throw new AppError("invalid_input");
    const meta = await getStore().getMeta(id);
    const tab = meta.tabs.find((x) => x.title === TABS.templates)!;
    await getStore().batchUpdate(id, [{ deleteDimension: { range: { sheetId: tab.sheetId, dimension: "ROWS", startIndex: row._row - 1, endIndex: row._row } } }]);
    await logActivity(ctx, "Template deleted", templateId);
    revalidatePath(`/c/${id}`, "layout");
    return true;
  });
}

function sampleContact(ctx: Awaited<ReturnType<typeof loadCompany>>, contactId: string | undefined, language: string): Row {
  const rows = ctx.t[TABS.contacts].rows;
  return (
    (contactId && rows.find((r) => get(r, "ID") === contactId)) ||
    rows.find((r) => normalizeLanguage(get(r, "Language")) === normalizeLanguage(language)) ||
    rows[0] || { _row: 0, ID: "SAMPLE", "Contact Name": "محمد أحمد", Company: "شركة مثال", City: "الرياض", Industry: "التجارة", Language: language }
  );
}

export async function previewTemplate(id: string, d: TemplateDraft, contactId?: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const contact = sampleContact(ctx, contactId, d.language);
    const tpl = toTpl(d);
    // Use the draft in place of the saved one so the preview reflects unsaved edits.
    ctx.templates = [...ctx.templates.filter((x) => x.id !== d.id), { ...tpl, active: true }];
    const m = composeFor(ctx, senderSettings(ctx), { contact, step: tpl.step, template: tpl, kind: tpl.step ? "followup" : "first" });
    return { subject: m.subject, html: m.html, text: m.text, missing: m.missing, contactId: get(contact, "ID"), rtl: tpl.language === "AR" };
  });
}

export async function sendTemplateTest(id: string, d: TemplateDraft, contactId?: string) {
  return act(async () => {
    await requireSession();
    const ctx = await loadCompany(id);
    const s = senderSettings(ctx);
    const contact = sampleContact(ctx, contactId, d.language);
    const tpl = toTpl(d);
    ctx.templates = [...ctx.templates.filter((x) => x.id !== d.id), { ...tpl, active: true }];
    const m = composeFor(ctx, s, { contact, step: tpl.step, template: tpl, kind: tpl.step ? "followup" : "first" });
    const to = s.smtp.replyTo || s.smtp.fromEmail;
    if (!to) throw new AppError("smtp_missing");
    await getMailer().send(s.smtp, {
      to, subject: `[تجربة] ${m.subject}`, text: m.text, html: m.html,
      messageId: `<test.${Date.now()}@${domainOf(s.smtp.fromEmail) || "outreach.local"}>`,
    });
    await logActivity(ctx, "Template test sent", `${d.id || "draft"} → ${to} (contact ${get(contact, "ID")})`);
    return { to, missing: m.missing };
  });
}
