// Demo data: a Registry and two company sheets in memory, so the whole UI can be tried without real accounts.
import { encrypt } from "../crypto";
import { registrySheetId } from "../env";
import {
  ACTIVITY_HEADERS, COMPANY_KEYS, CONTACT_HEADERS, DNC_HEADERS, KV_HEADERS, MAPPING_HEADERS, MONDAY_FIELDS, MONDAY_KEYS,
  MONDAY_MAP_HEADER, REGISTRY_HEADERS, SCHEDULE_HEADERS, SEND_LOG_HEADERS, SENDER_KEYS, TABS, TEMPLATE_HEADERS, type KvDef,
} from "../schema";
import { MemorySheetStore } from "../sheets/memory";

export const DEMO_A = "demoNourDigital000000000000001";
export const DEMO_B = "demoBrightSolar00000000000002";

let seed = 42;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

function kvRows(defs: KvDef[], values: Record<string, string>): string[][] {
  return [KV_HEADERS, ...defs.map((d) => [d.key, values[d.key] ?? d.default ?? "", d.description])];
}

function table(headers: string[], objs: Record<string, string>[]): string[][] {
  return [headers, ...objs.map((o) => headers.map((h) => o[h] ?? ""))];
}

const FIRST = ["محمد", "أحمد", "سارة", "خالد", "نورة", "عمر", "ليلى", "يوسف", "مريم", "فهد", "هند", "طارق", "ريم", "سلمان", "دينا"];
const LAST = ["العتيبي", "الشمري", "حسن", "إبراهيم", "القحطاني", "منصور", "الزهراني", "سليمان", "عبدالله", "فاروق"];
const COMPANIES = [
  ["مطاعم البيت", "baitfood"], ["عيادات الشفاء", "shifaa-clinics"], ["مكتب الريادة العقاري", "riyada-re"], ["مدارس الأفق", "ofoq-schools"],
  ["معرض النخبة للسيارات", "nokhba-cars"], ["صالون لمسة", "lamsa-beauty"], ["مصنع الوفاء", "wafaa-factory"], ["فندق الواحة", "waha-hotel"],
  ["شركة سما للتجارة", "sama-trade"], ["مختبرات دقة", "deqqa-labs"], ["جيم القوة", "power-gym"], ["مكتبة المعرفة", "marefa-books"],
  ["متجر زهور", "zohoor-shop"], ["مركز تطوير", "tatweer-center"], ["شركة بناء المستقبل", "future-build"], ["حلويات السعادة", "saada-sweets"],
];
const CITIES = ["الرياض", "جدة", "القاهرة", "الدمام", "الإسكندرية", "دبي"];
const INDUSTRIES = ["مطاعم", "طب", "عقارات", "تعليم", "سيارات", "تجميل", "صناعة", "ضيافة", "تجارة"];
const EN_COMPANIES = [["Acme Logistics", "acmelogistics"], ["Blue Ocean Travel", "blueocean-travel"], ["Nova Fitness", "novafit"], ["Peak Dental", "peakdental"], ["Urban Cafe", "urbancafe"], ["Green Energy Co", "greenenergyco"]];

function iso(d: Date) {
  return d.toISOString();
}

function buildCompanyA() {
  const now = Date.now();
  const contacts: Record<string, string>[] = [];
  const log: Record<string, string>[] = [];
  const activity: Record<string, string>[] = [];
  let mid = 1;
  const total = 72;
  for (let i = 1; i <= total; i++) {
    const en = i % 7 === 0;
    const [compName, slug] = en ? pick(EN_COMPANIES) : COMPANIES[(i - 1) % COMPANIES.length];
    const domain = `${slug}${i > 16 ? i : ""}.com`;
    const first = en ? pick(["John", "Emma", "David", "Sophie", "Mark"]) : pick(FIRST);
    const last = en ? pick(["Smith", "Brown", "Clark", "Lee"]) : pick(LAST);
    const id = `C${String(i).padStart(4, "0")}`;
    const c: Record<string, string> = {
      ID: id,
      "Added At": iso(new Date(now - (20 - (i % 15)) * 86400_000)),
      Source: i % 3 === 0 ? "LinkedIn" : i % 3 === 1 ? "Google Maps" : "معرض",
      Company: compName,
      "Contact Name": `${first} ${last}`,
      Title: en ? "Manager" : pick(["المدير العام", "مدير التسويق", "المالك", "مدير المبيعات"]),
      Email: i === 9 ? `fail-${domain.split(".")[0]}@${domain}` : `${en ? first.toLowerCase() : "info"}@${domain}`,
      Phone: `+9665${String(10000000 + i * 7919).slice(0, 8)}`,
      Website: `https://www.${domain}`,
      Industry: en ? "Services" : i === 50 ? "" : pick(INDUSTRIES),
      City: en ? "Dubai" : pick(CITIES),
      Country: en ? "UAE" : "السعودية",
      Language: en ? "EN" : "AR",
      Tags: [i % 4 === 0 ? "vip" : "", i % 5 === 0 ? "معرض-2026" : "", i % 2 ? "cold" : ""].filter(Boolean).join(", "),
      Status: "Ready",
    };
    // Send history for the first ~45 contacts
    if (i <= 46) {
      const daysAgo = Math.floor((i - 1) / 3.3);
      const firstSent = new Date(now - daysAgo * 86400_000 - (i % 5) * 3600_000);
      let step = 0;
      if (daysAgo >= 4 && i % 2 === 0) step = 1;
      if (daysAgo >= 9 && i % 4 === 0) step = 2;
      const refs: string[] = [];
      const ver = i % 2 ? "A" : "B";
      for (let s = 0; s <= step; s++) {
        const at = new Date(firstSent.getTime() + (s === 0 ? 0 : s === 1 ? 3 : 8) * 86400_000);
        if (at.getTime() > now) break;
        const msgId = `<demo${mid++}.seed@alnoor.digital>`;
        refs.push(msgId);
        log.push({
          Time: iso(at), "Run ID": `A${String(i).padStart(3, "0")}`, "Run Type": s === 0 && i % 3 === 0 ? "manual" : "auto",
          "Contact ID": id, Email: c.Email, Template: s === 0 ? (en ? "T5" : ver === "A" ? "T1" : "T2") : s === 1 ? (en ? "T6" : "T3") : "T4",
          Step: String(s), Result: "Sent", "Message ID": msgId, "monday Result": "Synced",
        });
        c.Step = String(s);
        c["Last Sent At"] = iso(at);
      }
      c.Version = en ? "A" : ver;
      c["Last Message ID"] = refs[refs.length - 1];
      c["Thread References"] = refs.join(" ");
      c["monday Item ID"] = String(8800000 + i);
      c["monday Status"] = "Synced";
      const st = Number(c.Step);
      c.Status = st === 0 ? "Sent" : st === 2 ? "Completed" : `Follow-up ${st}`;
      if (st < 2) c["Next Send At"] = iso(new Date(new Date(c["Last Sent At"]).getTime() + (st === 0 ? 3 : 5) * 86400_000));
      if (i % 9 === 0) { c.Status = "Replied"; c["Next Send At"] = ""; }
      if (i === 13 || i === 31) { c.Status = "Bounced"; c["Next Send At"] = ""; c.Error = "Bounce: Delivery Status Notification (Failure)"; }
      if (i === 22) { c.Status = "Unsubscribed"; c["Next Send At"] = ""; }
      if (i === 17) { c["monday Status"] = "Failed: ColumnValueException: invalid phone value"; c["monday Item ID"] = ""; }
    } else if (i > 66) {
      c.Status = "New";
    }
    if (i === 70) { c.Status = "Invalid"; c.Email = "no-email"; }
    if (i === 71) { c.Status = "Duplicate"; }
    contacts.push(c);
  }
  // A couple of failed attempts
  log.push({ Time: iso(new Date(now - 2 * 86400_000)), "Run ID": "A900", "Run Type": "auto", "Contact ID": "C0009", Email: contacts[8].Email, Template: "T1", Step: "0", Result: "Failed", Error: "smtp_recipient: 550 5.1.1 The email account does not exist" });
  log.sort((a, b) => a.Time.localeCompare(b.Time));
  for (let d = 10; d >= 0; d--) {
    activity.push({ Time: iso(new Date(now - d * 86400_000 - 3600_000)), Action: "Run auto", Details: `sent ${2 + (d % 4)}/${2 + (d % 4)}` });
    if (d % 3 === 0) activity.push({ Time: iso(new Date(now - d * 86400_000 - 1800_000)), Action: "Inbox check", Details: `replies 1, bounces ${d === 6 ? 1 : 0}, unsubscribes 0` });
  }
  activity.unshift({ Time: iso(new Date(now - 20 * 86400_000)), Action: "Import", Details: "72 contacts from leads.xlsx (Google Maps)" });
  activity.unshift({ Time: iso(new Date(now - 21 * 86400_000)), Action: "Initialize sheet", Details: "tabs: Company, Sender, Monday, Templates, Contacts, Send Log, Schedule, Do Not Contact, Activity, Mappings" });

  const sig = "أحمد سمير\nمدير تطوير الأعمال — النور للحلول الرقمية\n+966 55 123 4567";
  const templates = [
    { "Template ID": "T1", Name: "أول رسالة — مباشرة", Language: "AR", Step: "0", "Delay Days": "0", Version: "A", Active: "yes",
      Subject: "{first_name}، فكرة سريعة لـ {company}",
      Body: "أهلاً {first_name}،\n\nأنا {sender_name} من {our_company}. نساعد شركات {industry} في {city} على زيادة العملاء من الإنترنت خلال 90 يومًا.\n\nهل يناسبك اتصال قصير 15 دقيقة هذا الأسبوع؟\n{booking_link}\n\n{signature}\n\n{unsubscribe}" },
    { "Template ID": "T2", Name: "أول رسالة — سؤال", Language: "AR", Step: "0", "Delay Days": "0", Version: "B", Active: "yes",
      Subject: "سؤال بخصوص {company}",
      Body: "أهلاً {first_name}،\n\nسؤال سريع: كم عميل جديد يصل لـ {company} شهريًا من الإنترنت؟\n\nفي {our_company} ضاعفنا هذا الرقم لعدة شركات {industry}. هذا ملفنا: {profile_link}\n\n{signature}\n\n{unsubscribe}" },
    { "Template ID": "T3", Name: "متابعة 1", Language: "AR", Step: "1", "Delay Days": "3", Version: "A", Active: "yes", Subject: "",
      Body: "أهلاً {first_name}،\n\nأحببت أتأكد أن رسالتي وصلتك. لو الوقت غير مناسب الآن، أخبرني بموعد أفضل.\n\n{signature}\n\n{unsubscribe}" },
    { "Template ID": "T4", Name: "متابعة 2 — أخيرة", Language: "AR", Step: "2", "Delay Days": "5", Version: "A", Active: "yes", Subject: "",
      Body: "أهلاً {first_name}،\n\nهذه آخر رسالة مني. لو احتجتم مستقبلًا لمساعدة في التسويق الرقمي لـ {company}، يسعدنا التواصل.\n\n{signature}" },
    { "Template ID": "T5", Name: "First email", Language: "EN", Step: "0", "Delay Days": "0", Version: "A", Active: "yes",
      Subject: "Quick idea for {company}",
      Body: "Hi {first_name},\n\nI'm {sender_name} from {our_company}. We help companies like {company} get more customers online.\n\nOpen to a 15-minute call this week? {booking_link}\n\nBest,\n{sender_name}\n\n{unsubscribe}" },
    { "Template ID": "T6", Name: "Follow-up 1", Language: "EN", Step: "1", "Delay Days": "3", Version: "A", Active: "yes", Subject: "",
      Body: "Hi {first_name},\n\nJust bumping this up in case it got buried. Worth a quick chat?\n\n{sender_name}\n\n{unsubscribe}" },
  ];
  const tomorrow = new Date(now + 86400_000);
  tomorrow.setUTCHours(7, 30, 0, 0);
  const schedule = [
    { "Run ID": "S-VIP-01", "Run At": iso(tomorrow), Count: "10", Filter: "tags:vip", Status: "Pending", Result: "", "Created At": iso(new Date(now - 3600_000)) },
    { "Run ID": "S-EXPO-02", "Run At": iso(new Date(tomorrow.getTime() + 2 * 86400_000)), Count: "15", Filter: "tags:معرض-2026; language:AR", Status: "Pending", Result: "", "Created At": iso(new Date(now - 7200_000)) },
    { "Run ID": "S-OLD-00", "Run At": iso(new Date(now - 5 * 86400_000)), Count: "5", Filter: "", Status: "Done", Result: "5/5 sent", "Created At": iso(new Date(now - 6 * 86400_000)) },
  ];
  return {
    company: kvRows(COMPANY_KEYS, {
      "Company Name": "النور للحلول الرقمية", Website: "https://alnoor.digital", Phone: "+966 11 555 0101", WhatsApp: "+966 55 123 4567",
      Address: "الرياض، حي العليا", "Short Description": "وكالة تسويق رقمي متخصصة في الشركات الصغيرة والمتوسطة",
      "Profile Link": "https://alnoor.digital/profile.pdf", "Booking Link": "https://cal.com/alnoor/15min", "Logo URL": "", Signature: sig,
    }),
    sender: kvRows(SENDER_KEYS, {
      "From Name": "أحمد سمير", "From Email": "ahmed@alnoor.digital", "Reply-To": "", "SMTP Host": "smtp.gmail.com", "SMTP Port": "465",
      "SMTP Secure": "yes", "SMTP User": "ahmed@alnoor.digital", "SMTP Password": encrypt("demo-app-pass-wxyz"), "IMAP Host": "imap.gmail.com",
      "IMAP Port": "993", "IMAP User": "", "IMAP Password": "", "Daily Limit": "30", "Emails Per Run": "5", "Delay Between Emails": "2",
      "Send Days": "Sun,Mon,Tue,Wed,Thu,Fri,Sat", "Send Start Hour": "0", "Send End Hour": "24", Timezone: "Asia/Riyadh", "Auto Sending": "on",
      "SMTP Tested At": iso(new Date(now - 3 * 86400_000)), "IMAP Tested At": iso(new Date(now - 3 * 86400_000)), "IMAP Last UID": "99",
      "Last Run At": iso(new Date(now - 40 * 60_000)), "Last Run ID": "A046", "Last Run Result": "auto: sent 2/2",
    }),
    monday: [
      ...kvRows(MONDAY_KEYS, { "API Token": encrypt("demo-monday-token-k9P2"), "Board ID": "1234567890", "Group ID": "topics", "Account Slug": "demo-account" }),
      [MONDAY_MAP_HEADER[0], MONDAY_MAP_HEADER[1], "ربط الحقول بأعمدة monday"],
      ...MONDAY_FIELDS.map((f) => [f, { email: "email_mk1", status: "status", step: "numbers_step", "last sent": "date_last", "next send": "date_next", company: "text_company", person: "text_person", phone: "phone_mk1", website: "link_web" }[f as string] || "", ""]),
    ],
    templates: table(TEMPLATE_HEADERS, templates),
    contacts: table(CONTACT_HEADERS, contacts),
    log: table(SEND_LOG_HEADERS, log),
    schedule: table(SCHEDULE_HEADERS, schedule),
    dnc: table(DNC_HEADERS, [
      { "Email or Domain": "competitor.com", Reason: "منافس", "Added At": iso(new Date(now - 15 * 86400_000)) },
      { "Email or Domain": contacts[12].Email, Reason: "Bounce", "Added At": iso(new Date(now - 6 * 86400_000)) },
      { "Email or Domain": contacts[21].Email, Reason: "Unsubscribe reply", "Added At": iso(new Date(now - 4 * 86400_000)) },
      { "Email or Domain": contacts[30].Email, Reason: "Bounce", "Added At": iso(new Date(now - 2 * 86400_000)) },
    ]),
    activity: table(ACTIVITY_HEADERS, activity),
  };
}

function buildCompanyB() {
  const now = Date.now();
  const contacts = EN_COMPANIES.map(([name, slug], i) => ({
    ID: `C${String(i + 1).padStart(4, "0")}`, "Added At": iso(new Date(now - 86400_000)), Source: "CSV", Company: name,
    "Contact Name": ["Liam Carter", "Olivia Reed", "Noah Hayes", "Ava Brooks", "Ethan Ward", "Mia Foster"][i], Title: "Owner",
    Email: `hello@${slug}.com`, Phone: `+97150${1000000 + i}`, Website: `${slug}.com`, Industry: "Retail", City: "Dubai", Country: "UAE",
    Language: "EN", Tags: "solar-q4", Status: i < 4 ? "Ready" : "New",
  }));
  return {
    company: kvRows(COMPANY_KEYS, { "Company Name": "Bright Solar", Website: "https://brightsolar.example", Signature: "Sara — Bright Solar" }),
    sender: kvRows(SENDER_KEYS, { "From Name": "Sara", "From Email": "sara@brightsolar.example", "SMTP Host": "smtp.zoho.com", "SMTP User": "sara@brightsolar.example", Timezone: "Asia/Dubai", "Auto Sending": "off" }),
    monday: [...kvRows(MONDAY_KEYS, {}), [MONDAY_MAP_HEADER[0], MONDAY_MAP_HEADER[1], ""], ...MONDAY_FIELDS.map((f) => [f, "", ""])],
    templates: table(TEMPLATE_HEADERS, [
      { "Template ID": "T1", Name: "Intro", Language: "EN", Step: "0", "Delay Days": "0", Version: "A", Active: "yes", Subject: "Cut {company}'s power bill", Body: "Hi {first_name},\n\nWe install rooftop solar for {industry} businesses in {city}.\n\n{signature}\n\n{unsubscribe}" },
    ]),
    contacts: table(CONTACT_HEADERS, contacts),
    log: table(SEND_LOG_HEADERS, []),
    schedule: table(SCHEDULE_HEADERS, []),
    dnc: table(DNC_HEADERS, []),
    activity: table(ACTIVITY_HEADERS, [{ Time: iso(new Date(now - 86400_000)), Action: "Initialize sheet", Details: "all tabs created" }]),
  };
}

function load(store: MemorySheetStore, id: string, title: string, data: ReturnType<typeof buildCompanyA>) {
  store.createBook(id, title);
  const b = store.books.get(id)!;
  const tabs: [string, string[][]][] = [
    [TABS.company, data.company], [TABS.sender, data.sender], [TABS.monday, data.monday], [TABS.templates, data.templates],
    [TABS.contacts, data.contacts], [TABS.sendLog, data.log], [TABS.schedule, data.schedule], [TABS.dnc, data.dnc],
    [TABS.activity, data.activity], [TABS.mappings, [MAPPING_HEADERS]],
  ];
  tabs.forEach(([title, rows], i) => b.tabs.push({ sheetId: 1000 + i, title, rows, rightToLeft: true, frozenRows: 1 }));
}

const g = globalThis as unknown as { __demoStore?: MemorySheetStore };

export function getDemoStore(): MemorySheetStore {
  if (g.__demoStore) return g.__demoStore;
  seed = 42;
  const store = new MemorySheetStore();
  store.autoCreate = true;
  const reg = registrySheetId();
  store.createBook(reg, "Outreach Registry");
  store.books.get(reg)!.tabs.push(
    { sheetId: 1, title: "Companies", rightToLeft: true, frozenRows: 1, rows: [
      REGISTRY_HEADERS,
      ["النور للحلول الرقمية", `https://docs.google.com/spreadsheets/d/${DEMO_A}/edit`, "#0f766e", "yes"],
      ["Bright Solar", `https://docs.google.com/spreadsheets/d/${DEMO_B}/edit`, "#d97706", "yes"],
    ] },
    { sheetId: 2, title: "System", rows: [["key", "value"], ["Last Cron At", new Date(Date.now() - 6 * 60_000).toISOString()]] },
  );
  load(store, DEMO_A, "Outreach — النور", buildCompanyA());
  load(store, DEMO_B, "Outreach — Bright Solar", buildCompanyB());
  g.__demoStore = store;
  return store;
}
