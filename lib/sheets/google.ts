// Real Google Sheets API v4 store, authenticated with a service account (JWT). Retries 429/5xx with backoff.
import { JWT } from "google-auth-library";
import { AppError } from "../errors";
import type { SheetMeta, SheetStore, ValueRange } from "./types";
import { quoteTab } from "./types";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

type Creds = { client_email: string; private_key: string };

function parseCreds(): Creds {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  try {
    const j = JSON.parse(raw);
    if (!j.client_email || !j.private_key) throw new Error("missing client_email/private_key");
    return { client_email: j.client_email, private_key: String(j.private_key).replace(/\\n/g, "\n") };
  } catch (e) {
    throw new AppError("service_account_invalid", (e as Error).message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class GoogleSheetStore implements SheetStore {
  private jwt: JWT;
  private creds: Creds;
  constructor() {
    this.creds = parseCreds();
    this.jwt = new JWT({
      email: this.creds.client_email,
      key: this.creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  serviceAccountEmail() {
    return this.creds.client_email;
  }

  private async call<T>(method: string, url: string, body?: unknown): Promise<T> {
    let attempt = 0;
    for (;;) {
      const { token } = await this.jwt.getAccessToken();
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
      if (res.ok) return (await res.json()) as T;
      const text = await res.text();
      if ((res.status === 429 || res.status >= 500) && attempt < 5) {
        attempt++;
        await sleep(Math.min(16000, 500 * 2 ** attempt) + Math.random() * 300);
        continue;
      }
      if (res.status === 403) throw new AppError("sheet_no_access", text.slice(0, 500));
      if (res.status === 404) throw new AppError("sheet_not_found", text.slice(0, 500));
      throw new AppError("sheets_api", `${res.status} ${text.slice(0, 500)}`);
    }
  }

  async getMeta(sheetId: string): Promise<SheetMeta> {
    type R = {
      properties: { title: string };
      sheets: { properties: { title: string; sheetId: number; rightToLeft?: boolean; gridProperties?: { frozenRowCount?: number } } }[];
    };
    const r = await this.call<R>(
      "GET",
      `${API}/${sheetId}?fields=properties.title,sheets.properties(title,sheetId,rightToLeft,gridProperties.frozenRowCount)`,
    );
    return {
      title: r.properties.title,
      tabs: r.sheets.map((s) => ({
        title: s.properties.title,
        sheetId: s.properties.sheetId,
        rightToLeft: s.properties.rightToLeft,
        frozenRows: s.properties.gridProperties?.frozenRowCount,
      })),
    };
  }

  async batchGet(sheetId: string, ranges: string[]): Promise<string[][][]> {
    if (!ranges.length) return [];
    const qs = ranges.map((r) => "ranges=" + encodeURIComponent(r.includes("!") ? r : quoteTab(r))).join("&");
    type R = { valueRanges: { values?: unknown[][] }[] };
    const r = await this.call<R>(
      "GET",
      `${API}/${sheetId}/values:batchGet?${qs}&valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`,
    );
    return r.valueRanges.map((vr) => (vr.values || []).map((row) => row.map((c) => (c == null ? "" : String(c)))));
  }

  async batchUpdateValues(sheetId: string, data: ValueRange[]): Promise<void> {
    if (!data.length) return;
    // RAW keeps phone numbers and IDs as text (no auto-conversion to numbers/dates).
    await this.call("POST", `${API}/${sheetId}/values:batchUpdate`, { valueInputOption: "RAW", data });
  }

  async append(sheetId: string, tab: string, rows: string[][]): Promise<void> {
    if (!rows.length) return;
    await this.call(
      "POST",
      `${API}/${sheetId}/values/${encodeURIComponent(quoteTab(tab) + "!A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { values: rows },
    );
  }

  async batchUpdate(sheetId: string, requests: object[]): Promise<void> {
    if (!requests.length) return;
    await this.call("POST", `${API}/${sheetId}:batchUpdate`, { requests });
  }
}
