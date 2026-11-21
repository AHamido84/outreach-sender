// Demo-mode providers: deterministic fake people/businesses based on the filters.
import { AppError } from "../errors";
import { stableHash } from "../selection";
import { splitList } from "./http";
import type { ApolloFilters, Found, HunterFilters, OutscraperFilters, RevealResult, SearchResult } from "./types";

const FIRST = ["أحمد", "سارة", "خالد", "نورة", "عمر", "ليلى", "يوسف", "مريم", "فهد", "هند", "Omar", "Lina", "Karim", "Dana"];
const LAST = ["العتيبي", "الشمري", "حسن", "القحطاني", "منصور", "الزهراني", "Haddad", "Saleh", "Nasser"];
const COS = [["مجموعة الرواد", "rowad-group.sa"], ["شركة المدار", "madar.com.sa"], ["أفق للاستشارات", "ofoq-consult.com"], ["نخبة العقار", "nokhba-realestate.sa"],
  ["عيادات الأمل", "amal-clinics.com"], ["مطاعم السرايا", "saraya-food.com"], ["TechWave", "techwave.io"], ["Gulf Logistics", "gulflogistics.ae"]];
const TITLES = ["المدير العام", "مدير التسويق", "Head of Sales", "CEO", "Marketing Manager", "Founder", "مدير العمليات"];

const g = globalThis as unknown as { __demoApollo?: Map<string, Found> };
const store = () => (g.__demoApollo ||= new Map());

function check(key: string) {
  if (/bad|wrong/i.test(key)) throw new AppError("source_auth", "Invalid API key (demo)");
}

function person(seed: string, i: number, f?: { titles?: string; locations?: string }): Found {
  const h = stableHash(`${seed}:${i}`);
  const [company, domain] = COS[h % COS.length];
  const first = FIRST[h % FIRST.length];
  const last = LAST[(h >> 4) % LAST.length];
  const title = splitList(f?.titles)[i % Math.max(1, splitList(f?.titles).length)] || TITLES[(h >> 7) % TITLES.length];
  const city = splitList(f?.locations)[0] || ["الرياض", "جدة", "دبي", "القاهرة"][(h >> 9) % 4];
  return {
    key: `demo_${h.toString(36)}`, company, contactName: `${first} ${last}`, title,
    email: `${["info", "sales", first.toLowerCase().replace(/[^a-z]/g, "") || "contact"][(h >> 3) % 3]}${i}@${domain}`,
    phone: `+9665${String(h).slice(0, 8)}`, website: `https://${domain}`, industry: ["Marketing", "Healthcare", "Real Estate", "Food", "IT"][(h >> 5) % 5],
    city, country: city === "دبي" ? "UAE" : city === "القاهرة" ? "Egypt" : "Saudi Arabia", linkedin: `https://www.linkedin.com/in/demo-${h.toString(36)}`,
    hasEmail: h % 7 !== 0, needsReveal: false,
  };
}

export async function fakeApolloSearch(key: string, f: ApolloFilters): Promise<SearchResult> {
  check(key);
  await new Promise((r) => setTimeout(r, 500));
  const seed = JSON.stringify([f.titles, f.locations, f.keywords, f.domains, f.seniorities, f.employees]);
  const per = Math.min(100, f.perPage || 25);
  const page = f.page || 1;
  const items = Array.from({ length: per }, (_, i) => {
    const full = person(seed, (page - 1) * per + i, f);
    store().set(full.key, full);
    const [fn, ln] = full.contactName.split(" ");
    return { ...full, contactName: `${fn} ${ln.slice(0, 1)}***${ln.slice(-1)}`, email: "", phone: "", website: "", linkedin: "", city: "", country: "", industry: "", needsReveal: true };
  });
  return { items, total: 1240, page };
}

export async function fakeApolloReveal(key: string, ids: string[]): Promise<RevealResult> {
  check(key);
  await new Promise((r) => setTimeout(r, 400));
  const items = ids.map((id) => store().get(id)).filter(Boolean).map((p) => ({ ...p!, email: p!.hasEmail ? p!.email : "", needsReveal: false })) as Found[];
  return { items, credits: items.filter((i) => i.email).length, missing: ids.length - items.length };
}

export async function fakeHunterSearch(key: string, f: HunterFilters): Promise<SearchResult> {
  check(key);
  await new Promise((r) => setTimeout(r, 400));
  const domain = (f.domain || f.company || "example.com").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const n = 3 + (stableHash(domain) % 6);
  const items = Array.from({ length: n }, (_, i) => {
    const p = person(domain, i);
    const local = i === 0 ? "info" : i === 1 ? "sales" : `${p.contactName.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") || "user"}${i}`;
    return { ...p, key: `${local}@${domain}`, email: `${local}@${domain}`, website: `https://${domain}`, company: domain.split(".")[0], confidence: 60 + ((i * 13) % 40), extra: i < 2 ? "generic" : "personal" };
  }).filter((x) => (x.confidence ?? 100) >= (f.minConfidence ?? 0));
  return { items, total: items.length, info: domain };
}

export async function fakeOutscraperSearch(key: string, f: OutscraperFilters): Promise<SearchResult> {
  check(key);
  await new Promise((r) => setTimeout(r, 700));
  const n = Math.min(f.limit || 20, 20);
  const items = Array.from({ length: n }, (_, i) => {
    const p = person(f.query, i);
    return { ...p, contactName: "", title: "", email: f.findEmails && i % 3 !== 2 ? `info@${p.website.replace("https://", "")}` : "", hasEmail: !!f.findEmails && i % 3 !== 2, extra: `★ ${(3.5 + (i % 15) / 10).toFixed(1)} · ${f.query}` };
  });
  return { items };
}
