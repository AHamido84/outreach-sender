// The sheet structure. Tab and column names are English and stable; the app finds columns by header name.

export const TABS = {
  company: "Company",
  sender: "Sender",
  monday: "Monday",
  templates: "Templates",
  contacts: "Contacts",
  sendLog: "Send Log",
  schedule: "Schedule",
  dnc: "Do Not Contact",
  activity: "Activity",
  mappings: "Mappings",
} as const;

export const KV_HEADERS = ["key", "value", "description"];

export type KvDef = { key: string; default?: string; description: string; secret?: boolean; system?: boolean };

export const COMPANY_KEYS: KvDef[] = [
  { key: "Company Name", description: "اسم شركتك كما يظهر في الرسائل" },
  { key: "Website", description: "موقع الشركة" },
  { key: "Phone", description: "رقم الهاتف" },
  { key: "WhatsApp", description: "رقم واتساب" },
  { key: "Address", description: "العنوان" },
  { key: "Short Description", description: "وصف قصير للشركة" },
  { key: "Profile Link", description: "رابط بروفايل الشركة (PDF أو صفحة)" },
  { key: "Booking Link", description: "رابط حجز موعد" },
  { key: "Logo URL", description: "رابط اللوجو" },
  { key: "Signature", description: "التوقيع (يمكن أن يكون عدة أسطر)" },
];

export const SENDER_KEYS: KvDef[] = [
  { key: "From Name", description: "اسم المرسل" },
  { key: "From Email", description: "إيميل المرسل" },
  { key: "Reply-To", description: "إيميل استلام الردود (اختياري)" },
  { key: "SMTP Host", description: "مثال: smtp.gmail.com" },
  { key: "SMTP Port", default: "465", description: "465 (SSL) أو 587 (STARTTLS)" },
  { key: "SMTP Secure", default: "yes", description: "yes للمنفذ 465، no للمنفذ 587" },
  { key: "SMTP User", description: "اسم المستخدم (عادةً الإيميل)" },
  { key: "SMTP Password", description: "كلمة المرور / App Password (تُحفظ مشفرة)", secret: true },
  { key: "IMAP Host", description: "مثال: imap.gmail.com" },
  { key: "IMAP Port", default: "993", description: "عادةً 993" },
  { key: "IMAP User", description: "فارغ = نفس SMTP User" },
  { key: "IMAP Password", description: "فارغ = نفس SMTP Password (تُحفظ مشفرة)", secret: true },
  { key: "Daily Limit", default: "30", description: "أقصى عدد إيميلات في اليوم" },
  { key: "Emails Per Run", default: "5", description: "أقصى عدد في كل تشغيل" },
  { key: "Delay Between Emails", default: "20", description: "ثواني بين كل إيميل والتالي" },
  { key: "Send Days", default: "Sun,Mon,Tue,Wed,Thu", description: "أيام الإرسال: Sat,Sun,Mon,Tue,Wed,Thu,Fri" },
  { key: "Send Start Hour", default: "9", description: "بداية نافذة الإرسال (0-23)" },
  { key: "Send End Hour", default: "17", description: "نهاية نافذة الإرسال (0-24)" },
  { key: "Timezone", default: "Africa/Cairo", description: "المنطقة الزمنية، مثال: Asia/Riyadh" },
  { key: "Auto Sending", default: "off", description: "on / off" },
  { key: "Max Bounce Rate", default: "5", description: "نسبة الارتداد القصوى % قبل الإيقاف التلقائي" },
  {
    key: "Unsubscribe Line",
    default: "إذا لم تكن مهتمًا، ردّ بكلمة «لا» ولن نراسلك مرة أخرى.",
    description: "سطر إلغاء الاشتراك ({unsubscribe})",
  },
  { key: "Lock", description: "نظام — لا تعدّل", system: true },
  { key: "SMTP Tested At", description: "نظام — آخر اختبار SMTP ناجح", system: true },
  { key: "IMAP Tested At", description: "نظام — آخر اختبار IMAP ناجح", system: true },
  { key: "Auth Failures In A Row", default: "0", description: "نظام", system: true },
  { key: "Last Run At", description: "نظام", system: true },
  { key: "Last Run ID", description: "نظام", system: true },
  { key: "Last Run Result", description: "نظام", system: true },
  { key: "Last Auto Send At", description: "نظام", system: true },
  { key: "IMAP Last UID", description: "نظام", system: true },
  { key: "IMAP Checked At", description: "نظام", system: true },
  { key: "Auto Off Reason", description: "نظام — سبب الإيقاف التلقائي", system: true },
];

export const MONDAY_KEYS: KvDef[] = [
  { key: "API Token", description: "توكن monday (يُحفظ مشفرًا)", secret: true },
  { key: "Board ID", description: "رقم البورد" },
  { key: "Group ID", description: "الجروب (اختياري)" },
  { key: "Create Item On", default: "first send", description: "first send / import / never" },
  { key: "Update Status On Reply", default: "yes", description: "yes / no" },
  { key: "Account Slug", description: "نظام — لروابط العناصر", system: true },
];

export const MONDAY_FIELDS = [
  "email",
  "status",
  "step",
  "last sent",
  "next send",
  "company",
  "person",
  "phone",
  "website",
  "city",
  "industry",
  "source",
  "notes",
] as const;
export type MondayField = (typeof MONDAY_FIELDS)[number];
export const MONDAY_MAP_HEADER = ["Field", "monday Column ID", "description"];

export const TEMPLATE_HEADERS = [
  "Template ID",
  "Name",
  "Language",
  "Step",
  "Delay Days",
  "Subject",
  "Body",
  "Version",
  "Active",
];

export const CONTACT_DATA_HEADERS = [
  "ID",
  "Added At",
  "Source",
  "Company",
  "Contact Name",
  "Title",
  "Email",
  "Phone",
  "Website",
  "Industry",
  "City",
  "Country",
  "Language",
  "Tags",
];
export const CONTACT_HEADERS = [
  ...CONTACT_DATA_HEADERS,
  "Status",
  "Step",
  "Version",
  "Last Sent At",
  "Next Send At",
  "Last Message ID",
  "Thread References",
  "monday Item ID",
  "monday Status",
  "Error",
  "Notes",
];

export const SEND_LOG_HEADERS = [
  "Time",
  "Run ID",
  "Run Type",
  "Contact ID",
  "Email",
  "Template",
  "Step",
  "Result",
  "Error",
  "Message ID",
  "monday Result",
  "monday Error",
];

export const SCHEDULE_HEADERS = ["Run ID", "Run At", "Count", "Filter", "Status", "Result", "Created At"];
export const DNC_HEADERS = ["Email or Domain", "Reason", "Added At"];
export const ACTIVITY_HEADERS = ["Time", "Action", "Details"];
export const MAPPING_HEADERS = ["Source", "Mapping", "Updated At"];

export const TABLE_TABS: { tab: string; headers: string[] }[] = [
  { tab: TABS.templates, headers: TEMPLATE_HEADERS },
  { tab: TABS.contacts, headers: CONTACT_HEADERS },
  { tab: TABS.sendLog, headers: SEND_LOG_HEADERS },
  { tab: TABS.schedule, headers: SCHEDULE_HEADERS },
  { tab: TABS.dnc, headers: DNC_HEADERS },
  { tab: TABS.activity, headers: ACTIVITY_HEADERS },
  { tab: TABS.mappings, headers: MAPPING_HEADERS },
];

export const KV_TABS: { tab: string; keys: KvDef[] }[] = [
  { tab: TABS.company, keys: COMPANY_KEYS },
  { tab: TABS.sender, keys: SENDER_KEYS },
  { tab: TABS.monday, keys: MONDAY_KEYS },
];

export const ALL_TABS = [TABS.company, TABS.sender, TABS.monday, ...TABLE_TABS.map((t) => t.tab)];

export const SECRET_KEYS: Record<string, string[]> = {
  [TABS.sender]: SENDER_KEYS.filter((k) => k.secret).map((k) => k.key),
  [TABS.monday]: MONDAY_KEYS.filter((k) => k.secret).map((k) => k.key),
};

export const STATUSES = [
  "New",
  "Ready",
  "Sent",
  "Follow-up",
  "Replied",
  "Bounced",
  "Unsubscribed",
  "Completed",
  "Invalid",
  "Duplicate",
] as const;

// Registry sheet
export const REGISTRY_TABS = { companies: "Companies", system: "System" } as const;
export const REGISTRY_HEADERS = ["Name", "Sheet URL", "Color", "Active"];
