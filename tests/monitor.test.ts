// Trang theo dõi cho máy khác: chỉ địa chỉ Tailscale, mật khẩu, chỉ xem. Test mở trên 127.0.0.1 thay cho địa chỉ Tailscale.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-monitor-"));
for (const f of readdirSync("data").filter((f) => f.endsWith(".json"))) cpSync(path.join("data", f), path.join(tmp, f));
process.env.MV_DATA_DIR = tmp;
process.env.PIPELINE_NO_WATCH = "1";
process.env.MUSE_NO_WATCH = "1";

const settingsFile = path.join(tmp, "settings.json");
const base = { ...JSON.parse(readFileSync(settingsFile, "utf8")), museMode: "haohao", songDir: "", driveFolder: "" };
const setSettings = (patch: Record<string, unknown>) => writeFileSync(settingsFile, JSON.stringify({ ...base, ...patch }));

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

afterAll(async () => {
  await (await import("@/lib/monitor")).stopMonitor();
  rmSync(tmp, { recursive: true, force: true });
});

describe("trang theo dõi", () => {
  it("nhận ra địa chỉ Tailscale", async () => {
    const { isTailscaleIp } = await import("@/lib/monitor");
    for (const a of ["100.64.0.1", "100.101.102.103", "100.127.255.254", "fd7a:115c:a1e0::1"]) expect(isTailscaleIp(a)).toBe(true);
    for (const a of ["100.63.0.1", "100.128.0.1", "192.168.1.10", "10.0.0.5", "127.0.0.1", "fe80::1"]) expect(isTailscaleIp(a)).toBe(false);
  });

  it("mật khẩu lưu dạng băm, so đúng / sai", async () => {
    const { hashPassword, checkPassword } = await import("@/lib/monitor");
    const h = await hashPassword("matkhau1");
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(h).not.toContain("matkhau1");
    expect(await checkPassword("matkhau1", h)).toBe(true);
    expect(await checkPassword("matkhau2", h)).toBe(false);
    expect(await checkPassword("matkhau1", undefined)).toBe(false);
  });

  it("cần mật khẩu; chỉ xem; tải được MP4 đã dựng; tắt là đóng cổng", async () => {
    const mon = await import("@/lib/monitor");
    const port = await freePort();
    // Chưa có mật khẩu → không mở dù đã bật.
    delete process.env.MONITOR_PASSWORD_HASH;
    setSettings({ monitorEnabled: true, monitorPort: port });
    await mon.syncMonitor(["127.0.0.1"]);
    expect((await mon.monitorStatus()).listening).toEqual([]);

    process.env.MONITOR_PASSWORD_HASH = await mon.hashPassword("matkhau1");
    // Một MV đã xong, có file MP4.
    const mvId = "mv_test1234";
    mkdirSync(path.join(tmp, "media", mvId), { recursive: true });
    writeFileSync(path.join(tmp, "media", mvId, "mv-1-test.mp4"), Buffer.from("fake mp4 bytes"));
    const steps = { script: { status: "done" }, song: { status: "done" }, clips: { status: "done" }, render: { status: "done" } };
    writeFileSync(
      path.join(tmp, "pipeline.json"),
      JSON.stringify({ items: [{ id: "pl_1", title: "Santa Monica Pier Summer 1954", added_at: "2026-10-20T00:00:00Z", mv_id: mvId, output: "mv-1-test.mp4", done_at: "2026-10-20T01:00:00Z", steps }] }),
    );
    await mon.syncMonitor(["127.0.0.1"]);
    expect((await mon.monitorStatus()).listening).toEqual(["127.0.0.1"]);

    const url = `http://127.0.0.1:${port}`;
    const auth = (pw: string) => ({ Authorization: `Basic ${Buffer.from(`ai-cung-duoc:${pw}`).toString("base64")}` });
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: auth("sai-mat-khau") })).status).toBe(401);
    const page = await fetch(url, { headers: auth("matkhau1") });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Christmas MV Studio — theo dõi");

    const status = await (await fetch(`${url}/api/status`, { headers: auth("matkhau1") })).json();
    expect(status.pipeline.items[0]).toMatchObject({ title: "Santa Monica Pier Summer 1954", video: `/file/${mvId}/mv-1-test.mp4` });
    expect(status.bank.counts).toBeDefined();
    expect(status.drive).toBeDefined();

    const video = await fetch(`${url}${status.pipeline.items[0].video}`, { headers: auth("matkhau1") });
    expect(video.status).toBe(200);
    expect(video.headers.get("content-type")).toBe("video/mp4");
    expect(await video.text()).toBe("fake mp4 bytes");

    // Không đọc được file ngoài thư mục MV / không phải MP4; không gửi lệnh được.
    expect((await fetch(`${url}/file/${mvId}/project.json`, { headers: auth("matkhau1") })).status).toBe(404);
    expect((await fetch(`${url}/file/..%2F..%2Fsettings.json/x.mp4`, { headers: auth("matkhau1") })).status).toBe(404);
    expect((await fetch(`${url}/api/status`, { method: "POST", headers: auth("matkhau1") })).status).toBe(405);

    // Tắt → đóng cổng.
    setSettings({ monitorEnabled: false, monitorPort: port });
    await mon.syncMonitor(["127.0.0.1"]);
    expect((await mon.monitorStatus()).listening).toEqual([]);
    await expect(fetch(url)).rejects.toThrow();
  });
});
