// Generates public/social/*.png (96x96, brand-colored circles with a white glyph) for email signatures.
// Email clients (Gmail, Outlook) don't render SVG, so signatures need PNG icons.
// Usage: node scripts/gen-social-icons.mjs <path-to-unpacked-simple-icons-package>   (needs Playwright)
// Glyphs: Simple Icons (CC0, https://simpleicons.org). LinkedIn and the globe are drawn here.
// Brand names and logos are trademarks of their owners; they are used only to link to your own profiles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SRC = process.argv[2];
if (!SRC) throw new Error("pass the simple-icons package dir");
const OUT = path.join(__dirname, "..", "public", "social");

const pathOf = (slug) => fs.readFileSync(path.join(SRC, "icons", `${slug}.svg`), "utf8").match(/ d="([^"]+)"/)[1];

const ICONS = [
  ["facebook", "#0866FF"], ["instagram", "#E4405F"], ["x", "#000000"], ["whatsapp", "#25D366"], ["youtube", "#FF0000"],
  ["tiktok", "#000000"], ["snapchat", "#FFFC00", "#000000"], ["telegram", "#26A5E4"], ["threads", "#000000"],
  ["behance", "#1769FF"], ["pinterest", "#BD081C"],
];

function svg(bg, glyph, fg = "#ffffff") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="${bg}"/>${glyph(fg)}</svg>`;
}
const simple = (slug) => (fg) => `<g transform="translate(24 24) scale(2)"><path fill="${fg}" d="${pathOf(slug)}"/></g>`;
const linkedin = (fg) => `<text x="48" y="65" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="50" fill="${fg}">in</text>`;
const globe = (fg) =>
  `<g transform="translate(24 24)" fill="none" stroke="${fg}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="20"/><path d="M4 24h40"/><path d="M24 4a30 30 0 0 1 8 20 30 30 0 0 1-8 20 30 30 0 0 1-8-20 30 30 0 0 1 8-20z"/></g>`;
const mail = (fg) =>
  `<g transform="translate(22 28)" fill="none" stroke="${fg}" stroke-width="4" stroke-linejoin="round"><rect x="2" y="2" width="48" height="36" rx="4"/><path d="M4 6l22 17L48 6"/></g>`;

await (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const all = [
    ...ICONS.map(([slug, bg, fg]) => [slug, svg(bg, simple(slug), fg)]),
    ["linkedin", svg("#0A66C2", linkedin)],
    ["website", svg("#0f766e", globe)],
    ["email", svg("#475569", mail)],
  ];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 96, height: 96 }, deviceScaleFactor: 1 });
  for (const [name, s] of all) {
    await page.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await page.locator("svg").screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
    console.log("wrote", name);
  }
  await browser.close();
})();
