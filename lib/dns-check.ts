// Deliverability check on the From domain: SPF, DKIM, DMARC and MX.
import { promises as dns } from "node:dns";

export type DnsItem = { key: "spf" | "dkim" | "dmarc" | "mx"; level: "ok" | "warn" | "error"; value: string; fix: string };

async function txt(name: string): Promise<string[]> {
  try {
    return (await dns.resolveTxt(name)).map((r) => r.join(""));
  } catch {
    return [];
  }
}

export async function checkDomain(domain: string, selector = "google"): Promise<DnsItem[]> {
  const d = domain.trim().toLowerCase();
  const [root, dkim, dmarc, mx] = await Promise.all([
    txt(d),
    txt(`${selector || "google"}._domainkey.${d}`),
    txt(`_dmarc.${d}`),
    dns.resolveMx(d).catch(() => [] as { exchange: string; priority: number }[]),
  ]);
  const spf = root.filter((r) => /^v=spf1/i.test(r));
  const dm = dmarc.find((r) => /^v=DMARC1/i.test(r));
  return [
    spf.length === 1
      ? { key: "spf", level: /[-~]all/.test(spf[0]) ? "ok" : "warn", value: spf[0], fix: /[-~]all/.test(spf[0]) ? "ok" : "spf" }
      : { key: "spf", level: spf.length ? "warn" : "error", value: spf.join(" | ") || "—", fix: spf.length ? "spfMulti" : "spf" },
    dkim.some((r) => /p=/.test(r))
      ? { key: "dkim", level: "ok", value: `${selector}._domainkey`, fix: "ok" }
      : { key: "dkim", level: "error", value: "—", fix: "dkim" },
    dm
      ? { key: "dmarc", level: /p=none/i.test(dm) ? "warn" : "ok", value: dm, fix: /p=none/i.test(dm) ? "dmarcNone" : "ok" }
      : { key: "dmarc", level: "error", value: "—", fix: "dmarc" },
    mx.length
      ? { key: "mx", level: "ok", value: mx.sort((a, b) => a.priority - b.priority).map((m) => m.exchange).slice(0, 3).join(", "), fix: "ok" }
      : { key: "mx", level: "error", value: "—", fix: "mx" },
  ] as DnsItem[];
}
