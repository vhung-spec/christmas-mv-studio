// Cài đặt: Thư mục nhạc ghi không kèm ổ đĩa (gói chuyển máy) = thư mục cạnh thư mục app.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-settings-"));
process.env.MV_DATA_DIR = tmp;
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("readSettings", () => {
  it("Thư mục nhạc tương đối → cạnh thư mục app; tuyệt đối giữ nguyên; trống vẫn trống", async () => {
    const { readSettings } = await import("@/lib/store");
    const parent = path.dirname(process.cwd());
    writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ songDir: "KHO NHAC" }));
    expect((await readSettings()).songDir).toBe(path.join(parent, "KHO NHAC"));
    const abs = path.join(tmp, "nhac");
    writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ songDir: abs }));
    expect((await readSettings()).songDir).toBe(abs);
    writeFileSync(path.join(tmp, "settings.json"), JSON.stringify({ songDir: "" }));
    expect((await readSettings()).songDir).toBe("");
  });
});
