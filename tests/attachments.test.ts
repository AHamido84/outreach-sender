import { afterEach, describe, expect, it, vi } from "vitest";

process.env.DEMO = "";
process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{}"; // not demo: use the real download path

const { loadAttachment, loadAttachments, MAX_FILE_BYTES } = await import("@/lib/attachments");

afterEach(() => vi.unstubAllGlobals());

describe("attachment downloads", () => {
  it("downloads a public file with its name from Content-Disposition", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { "content-type": "application/pdf", "content-disposition": "attachment; filename=\"profile.pdf\"" },
    })));
    const f = await loadAttachment({ url: "https://drive.google.com/file/d/AAA111/view" });
    expect(f).toMatchObject({ filename: "profile.pdf", contentType: "application/pdf", size: 3 });
  });
  it("uses the given name and the Drive direct link", async () => {
    const fetchMock = vi.fn(async (_u: string) => new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const [f] = await loadAttachments("كتالوج.png | https://drive.google.com/file/d/BBB222/view");
    expect(fetchMock.mock.calls[0][0]).toBe("https://drive.google.com/uc?export=download&id=BBB222");
    expect(f.filename).toBe("كتالوج.png");
  });
  it("rejects files that are not public (Drive returns an HTML page)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Sign in</html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } })));
    await expect(loadAttachment({ url: "https://drive.google.com/file/d/CCC333/view" })).rejects.toMatchObject({ code: "attachment_not_public" });
  });
  it("rejects files that are too big", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 200, headers: { "content-type": "application/pdf", "content-length": String(MAX_FILE_BYTES + 1) } })));
    await expect(loadAttachment({ url: "https://x.co/big.pdf" })).rejects.toMatchObject({ code: "attachment_too_big" });
  });
  it("reports HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    await expect(loadAttachment({ url: "https://x.co/missing.pdf" })).rejects.toMatchObject({ code: "attachment_failed" });
  });
});
