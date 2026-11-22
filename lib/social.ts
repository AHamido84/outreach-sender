// Social icons for email signatures. PNGs live in /public/social (email clients don't render SVG).
export const NETWORKS: { id: string; label: string; ph: string; toUrl?: (v: string) => string }[] = [
  { id: "facebook", label: "Facebook", ph: "https://facebook.com/…" },
  { id: "instagram", label: "Instagram", ph: "https://instagram.com/…" },
  { id: "linkedin", label: "LinkedIn", ph: "https://linkedin.com/company/…" },
  { id: "x", label: "X", ph: "https://x.com/…" },
  { id: "whatsapp", label: "WhatsApp", ph: "+966 5x xxx xxxx", toUrl: (v) => (/^https?:/i.test(v) ? v : `https://wa.me/${v.replace(/\D/g, "")}`) },
  { id: "youtube", label: "YouTube", ph: "https://youtube.com/@…" },
  { id: "tiktok", label: "TikTok", ph: "https://tiktok.com/@…" },
  { id: "snapchat", label: "Snapchat", ph: "https://snapchat.com/add/…" },
  { id: "telegram", label: "Telegram", ph: "https://t.me/…" },
  { id: "threads", label: "Threads", ph: "https://threads.net/@…" },
  { id: "behance", label: "Behance", ph: "https://behance.net/…" },
  { id: "pinterest", label: "Pinterest", ph: "https://pinterest.com/…" },
  { id: "website", label: "Website", ph: "https://…" },
  { id: "email", label: "Email", ph: "name@company.com", toUrl: (v) => (v.startsWith("mailto:") ? v : `mailto:${v.trim()}`) },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Build the signature row: each icon is an image wrapped in a link. */
export function socialRowHtml(base: string, values: Record<string, string>, size: number): string {
  const items = NETWORKS.filter((n) => values[n.id]?.trim()).map((n) => {
    let url = values[n.id].trim();
    url = n.toUrl ? n.toUrl(url) : /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`;
    return `<a href="${esc(url)}"><img src="${esc(`${base}/social/${n.id}.png`)}" alt="${n.label}" width="${size}"></a>`;
  });
  return items.length ? `<p>${items.join("&nbsp;&nbsp;")}</p>` : "";
}

