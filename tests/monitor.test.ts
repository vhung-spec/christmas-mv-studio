// Cổng từ xa: chỉ địa chỉ Tailscale, đăng nhập bằng mật khẩu (cookie phiên), trang theo dõi chỉ xem, và — khi cho phép điều
// khiển — chuyển tiếp mọi trang tới app. Test mở trên 127.0.0.1 thay cho địa chỉ Tailscale, "app" là một máy chủ giả.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-monitor-"));
for (const f of readdirSync("data").filter((f) => f.endsWith(".json"))) cpSync(path.join("data", f), path.join(tmp, f));
process.env.MV_DATA_DIR = tmp;
// Đổi mật khẩu ghi .env.local: ghi vào thư mục tạm, không đụng .env.local thật của app.
process.env.MV_ENV_FILE = path.join(tmp, ".env.local");
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

/** Gọi cổng bằng http thô: tự đặt Host / Origin / Cookie, không tự theo chuyển hướng. */
function call(port: number, method: string, p: string, opts: { headers?: Record<string, string>; body?: string | Buffer } = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }>((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p, headers: { host: `127.0.0.1:${port}`, ...opts.headers } }, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (c: Buffer) => parts.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(parts).toString("utf8") }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const servers: http.Server[] = [];
afterAll(async () => {
  await (await import("@/lib/monitor")).stopMonitor();
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  rmSync(tmp, { recursive: true, force: true });
});

describe("cổng từ xa", () => {
  it("nhận ra địa chỉ Tailscale; tên máy hợp lệ; đường dẫn quay về an toàn", async () => {
    const { isTailscaleIp } = await import("@/lib/monitor");
    const { okHost, safeNext } = await import("@/lib/remote");
    for (const a of ["100.64.0.1", "100.101.102.103", "100.127.255.254", "fd7a:115c:a1e0::1"]) expect(isTailscaleIp(a)).toBe(true);
    for (const a of ["100.63.0.1", "100.128.0.1", "192.168.1.10", "10.0.0.5", "127.0.0.1", "fe80::1"]) expect(isTailscaleIp(a)).toBe(false);
    for (const h of ["100.101.102.103:3301", "[fd7a:115c:a1e0::1]:3301", "may-chay:3301", "may-chay.tail1234.ts.net:3301", "127.0.0.1:3301"]) expect(okHost(h, isTailscaleIp)).toBe(true);
    for (const h of ["evil.example.com:3301", "192.168.1.10:3301", "", undefined]) expect(okHost(h, isTailscaleIp)).toBe(false);
    expect(safeNext("/pipeline?x=1", "/")).toBe("/pipeline?x=1");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "", null]) expect(safeNext(bad, "/pipeline")).toBe("/pipeline");
  }, 30000);

  it("mật khẩu lưu dạng băm, so đúng / sai", async () => {
    const { hashPassword, checkPassword } = await import("@/lib/monitor");
    const h = await hashPassword("matkhau1");
    expect(h).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(h).not.toContain("matkhau1");
    expect(await checkPassword("matkhau1", h)).toBe(true);
    expect(await checkPassword("matkhau2", h)).toBe(false);
    expect(await checkPassword("matkhau1", undefined)).toBe(false);
  });

  it("đăng nhập bằng trang riêng; chỉ xem khi chưa cho điều khiển; điều khiển = chuyển tiếp tới app; chặn trang lạ", async () => {
    const mon = await import("@/lib/monitor");
    const { clearLoginFails } = await import("@/lib/remote");
    const port = await freePort();
    // Chưa có mật khẩu → không mở dù đã bật.
    delete process.env.MONITOR_PASSWORD_HASH;
    setSettings({ monitorEnabled: true, monitorPort: port, remoteControl: false });
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
      JSON.stringify({ items: [{ id: "pl_1", title: "Rockefeller Center Christmas Eve 1955", added_at: "2026-10-20T00:00:00Z", mv_id: mvId, output: "mv-1-test.mp4", done_at: "2026-10-20T01:00:00Z", steps }] }),
    );
    await mon.syncMonitor(["127.0.0.1"]);
    expect((await mon.monitorStatus()).listening).toEqual(["127.0.0.1"]);

    const self = { origin: `http://127.0.0.1:${port}` };
    // Chưa đăng nhập: trang → sang trang đăng nhập; API → 401.
    let r = await call(port, "GET", "/");
    expect(r.status).toBe(303);
    expect(r.headers.location).toBe("/_remote/login?next=%2Fpipeline");
    expect((await call(port, "GET", "/api/status")).status).toBe(401);
    r = await call(port, "GET", "/_remote/login?next=%2Fpipeline");
    expect(r.status).toBe(200);
    expect(r.text).toContain("Mật khẩu");
    expect(r.headers["x-frame-options"]).toBe("DENY");

    // Tên miền lạ (đổi DNS) và form gửi từ trang khác bị chặn.
    expect((await call(port, "GET", "/_remote/login", { headers: { host: `evil.example.com:${port}` } })).status).toBe(421);
    const form = (pw: string) => `password=${encodeURIComponent(pw)}&next=${encodeURIComponent("/pipeline")}`;
    const formHeaders = { "content-type": "application/x-www-form-urlencoded" };
    expect((await call(port, "POST", "/_remote/login", { headers: formHeaders, body: form("matkhau1") })).status).toBe(403);
    expect((await call(port, "POST", "/_remote/login", { headers: { ...formHeaders, origin: "http://evil.example.com" }, body: form("matkhau1") })).status).toBe(403);

    r = await call(port, "POST", "/_remote/login", { headers: { ...formHeaders, ...self }, body: form("sai-mat-khau") });
    expect(r.status).toBe(401);
    expect(r.text).toContain("Sai mật khẩu");
    r = await call(port, "POST", "/_remote/login", { headers: { ...formHeaders, ...self }, body: form("matkhau1") });
    expect(r.status).toBe(303);
    // Chưa cho điều khiển → về trang theo dõi.
    expect(r.headers.location).toBe("/_remote/");
    const setCookie = String(r.headers["set-cookie"]);
    expect(setCookie).toMatch(/^xmas_remote=[\w-]{20,}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
    const cookie = setCookie.split(";")[0];
    // Chỉ lưu bản băm của mã phiên.
    const stored = readFileSync(path.join(tmp, "remote_sessions.json"), "utf8");
    expect(stored).not.toContain(cookie.split("=")[1]);
    expect((await mon.monitorStatus()).sessions).toBe(1);

    // Trang theo dõi + tình trạng + tải MP4.
    const auth = { cookie: `${cookie}; other=1` };
    r = await call(port, "GET", "/_remote/", { headers: auth });
    expect(r.status).toBe(200);
    expect(r.text).toContain("Christmas MV Studio — theo dõi");
    expect(r.text).toContain("chỉ xem");
    const status = JSON.parse((await call(port, "GET", "/_remote/api/status", { headers: auth })).text);
    expect(status.pipeline.items[0]).toMatchObject({ title: "Rockefeller Center Christmas Eve 1955", video: `/_remote/file/${mvId}/mv-1-test.mp4` });
    expect(status.bank.counts).toBeDefined();
    r = await call(port, "GET", status.pipeline.items[0].video, { headers: auth });
    expect(r.status).toBe(200);
    expect(r.headers["content-type"]).toBe("video/mp4");
    expect(r.text).toBe("fake mp4 bytes");
    expect((await call(port, "GET", `/_remote/file/${mvId}/project.json`, { headers: auth })).status).toBe(404);
    expect((await call(port, "GET", `/_remote/file/..%2F..%2Fsettings.json/x.mp4`, { headers: auth })).status).toBe(404);

    // Chưa cho điều khiển: trang của app bị chặn, "/" → trang theo dõi.
    r = await call(port, "GET", "/pipeline", { headers: auth });
    expect(r.status).toBe(403);
    expect(r.text).toContain("Điều khiển từ xa đang tắt");
    expect((await call(port, "GET", "/", { headers: auth })).headers.location).toBe("/_remote/");

    // Cho điều khiển: mọi trang / API chuyển tới app (ở đây là app giả), kèm đánh dấu "từ xa", không kèm cookie của cổng.
    const appPort = await freePort();
    const app = http.createServer((req, res) => {
      let size = 0;
      req.on("data", (c: Buffer) => (size += c.length));
      req.on("end", () => {
        res
          .writeHead(200, { "content-type": "application/json", "x-app": "1" })
          .end(JSON.stringify({ method: req.method, url: req.url, size, cookie: req.headers.cookie ?? null, remote: req.headers["x-mvs-remote"] ?? null }));
      });
    });
    servers.push(app);
    await new Promise<void>((resolve) => app.listen(appPort, "127.0.0.1", resolve));
    process.env.MVS_APP_PORT = String(appPort);
    setSettings({ monitorEnabled: true, monitorPort: port, remoteControl: true });
    expect((await mon.monitorStatus()).control).toBe(true);

    r = await call(port, "GET", "/pipeline?x=1", { headers: auth });
    expect(r.status).toBe(200);
    expect(r.headers["x-app"]).toBe("1");
    expect(JSON.parse(r.text)).toEqual({ method: "GET", url: "/pipeline?x=1", size: 0, cookie: "other=1", remote: "1" });
    // Trình duyệt tự gửi "x-mvs-remote" cũng không giả được: cổng ghi đè.
    expect(JSON.parse((await call(port, "GET", "/a", { headers: { ...auth, "x-mvs-remote": "0" } })).text).remote).toBe("1");
    // Lệnh (POST) từ chính trang của cổng → tới app, cả thân lớn (5 MB).
    const big = Buffer.alloc(5 * 1024 * 1024, 7);
    r = await call(port, "POST", "/api/upload", { headers: { ...auth, ...self, "content-type": "application/octet-stream" }, body: big });
    expect(JSON.parse(r.text)).toMatchObject({ method: "POST", url: "/api/upload", size: big.length });
    // Lệnh gửi từ trang khác / không rõ nguồn → chặn, không tới app.
    expect((await call(port, "POST", "/api/pipeline", { headers: { ...auth, origin: "http://evil.example.com" }, body: "{}" })).status).toBe(403);
    expect((await call(port, "POST", "/api/pipeline", { headers: auth, body: "{}" })).status).toBe(403);
    expect((await call(port, "POST", "/api/pipeline", { headers: { ...auth, referer: `http://127.0.0.1:${port}/pipeline` }, body: "{}" })).status).toBe(200);

    // App chưa chạy → trang báo, không treo.
    app.close();
    await new Promise((r2) => setTimeout(r2, 50));
    r = await call(port, "GET", "/pipeline", { headers: auth });
    expect(r.status).toBe(502);
    expect(r.text).toContain("App chưa chạy");

    // Đăng xuất: cookie bị xoá, phiên cũ hết dùng được.
    r = await call(port, "POST", "/_remote/logout", { headers: { ...auth, ...self } });
    expect(r.status).toBe(303);
    expect(String(r.headers["set-cookie"])).toContain("Max-Age=0");
    expect((await call(port, "GET", "/_remote/", { headers: auth })).status).toBe(303);

    // Đổi mật khẩu → đăng xuất mọi thiết bị.
    r = await call(port, "POST", "/_remote/login", { headers: { ...formHeaders, ...self }, body: form("matkhau1") });
    const cookie2 = String(r.headers["set-cookie"]).split(";")[0];
    expect((await call(port, "GET", "/_remote/", { headers: { cookie: cookie2 } })).status).toBe(200);
    await mon.setMonitorPassword("matkhau2");
    expect((await call(port, "GET", "/_remote/", { headers: { cookie: cookie2 } })).status).toBe(303);
    expect((await mon.monitorStatus()).sessions).toBe(0);

    // Sai mật khẩu 5 lần → khoá, kể cả khi sau đó gõ đúng.
    for (let i = 0; i < 5; i++) await call(port, "POST", "/_remote/login", { headers: { ...formHeaders, ...self }, body: form("doan-bua") });
    r = await call(port, "POST", "/_remote/login", { headers: { ...formHeaders, ...self }, body: form("matkhau2") });
    expect(r.status).toBe(429);
    expect(r.text).toContain("thử lại sau");
    clearLoginFails("127.0.0.1");

    // Tắt → đóng cổng.
    setSettings({ monitorEnabled: false, monitorPort: port });
    await mon.syncMonitor(["127.0.0.1"]);
    expect((await mon.monitorStatus()).listening).toEqual([]);
    await expect(call(port, "GET", "/")).rejects.toThrow();
  }, 30000);
});
