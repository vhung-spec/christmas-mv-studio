// Tự cập nhật: cài bản mới lên thư mục app (giữ dữ liệu, file thừa sang dự phòng, quay lại được), hỏi GitHub (máy chủ giả) → tải →
// giải nén → kiểm tra → ghi "chờ cài" và tự tắt với mã 75; gói tải lên; nhớ bản cài lỗi. Không gọi mạng thật, không đụng Thùng rác thật.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
// @ts-expect-error — script JS thuần của trình khởi động
import { applyUpdate, moveStale, planUpdate, pruneOld, rollbackUpdate } from "../scripts/cap-nhat.mjs";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-update-"));
const dataDir = path.join(tmp, "data");
mkdirSync(dataDir, { recursive: true });
for (const f of readdirSync("data").filter((f) => f.endsWith(".json"))) cpSync(path.join("data", f), path.join(dataDir, f));
process.env.MV_DATA_DIR = dataDir;
process.env.MV_TRASH_DIR = path.join(tmp, "thung-rac");
process.env.PIPELINE_NO_WATCH = "1";
process.env.MUSE_NO_WATCH = "1";

const put = (root: string, files: Record<string, string>) => {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), text);
  }
};
const read = (p: string) => readFileSync(p, "utf8");
const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
/** Nén thư mục `folder` (nằm trong `cwd`) thành zip — như gói GitHub / gói Dong-goi. */
const zip = (cwd: string, folder: string, out: string) => expect(spawnSync(tar, ["-a", "-c", "-f", out, folder], { cwd }).status).toBe(0);

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("cài bản mới lên thư mục app", () => {
  it("chép mã mới, giữ dữ liệu / .env / .bat, file thừa sang dự phòng; quay lại được", () => {
    const root = path.join(tmp, "app-a", "Christmas-MV-Studio");
    put(root, {
      "src/a.ts": "v1",
      "src/lib/songsUsed.ts": "bản cũ còn thừa",
      "scripts/start.mjs": "start v1",
      "data/settings.json": '{"cua":"ban"}',
      ".env.local": "ANTHROPIC_API_KEY=giu-nguyen",
      "Chay-Christmas-MV-Studio.bat": "bat cu",
      "node_modules/x/index.js": "thu vien",
      "package.json": '{"name":"christmas-mv-studio","v":1}',
    });
    const fresh = path.join(tmp, "moi-a", "Christmas-MV-Studio");
    put(fresh, {
      "src/a.ts": "v2",
      "src/moi.ts": "file mới",
      "scripts/start.mjs": "start v2",
      "data/settings.json": '{"mac":"dinh"}',
      "data/thu_vien_moi.json": "[]",
      "Chay-Christmas-MV-Studio.bat": "bat moi",
      "package.json": '{"name":"christmas-mv-studio","v":2}',
      "ban-cai.json": "{}",
    });
    const plan = planUpdate(root, fresh);
    expect(plan.copy.sort()).toEqual(["package.json", "scripts/start.mjs", "src/a.ts", "src/moi.ts"]);
    expect(plan.addData).toEqual(["data/thu_vien_moi.json"]);
    expect(plan.stale).toEqual(["src/lib/songsUsed.ts"]);

    const backup = path.join(tmp, "app-a", "Christmas-MV-Studio-cap-nhat", "cu-1");
    applyUpdate(root, fresh, backup);
    expect(read(path.join(root, "src/a.ts"))).toBe("v2");
    expect(read(path.join(root, "src/moi.ts"))).toBe("file mới");
    expect(existsSync(path.join(root, "src/lib/songsUsed.ts"))).toBe(false);
    expect(read(path.join(backup, "src/lib/songsUsed.ts"))).toBe("bản cũ còn thừa");
    expect(read(path.join(backup, "src/a.ts"))).toBe("v1");
    // Dữ liệu, key, file .bat đang chạy, thư viện: giữ nguyên; thư viện dữ liệu mới thì thêm.
    expect(read(path.join(root, "data/settings.json"))).toBe('{"cua":"ban"}');
    expect(read(path.join(root, "data/thu_vien_moi.json"))).toBe("[]");
    expect(read(path.join(root, ".env.local"))).toContain("giu-nguyen");
    expect(read(path.join(root, "Chay-Christmas-MV-Studio.bat"))).toBe("bat cu");
    expect(read(path.join(root, "node_modules/x/index.js"))).toBe("thu vien");
    expect(existsSync(path.join(root, "ban-cai.json"))).toBe(false);

    rollbackUpdate(root, backup);
    expect(read(path.join(root, "src/a.ts"))).toBe("v1");
    expect(read(path.join(root, "src/lib/songsUsed.ts"))).toBe("bản cũ còn thừa");
    expect(read(path.join(root, "scripts/start.mjs"))).toBe("start v1");
    expect(existsSync(path.join(root, "src/moi.ts"))).toBe(false);
    // File bản mới thêm vào không bị xoá: nằm trong dự phòng.
    expect(read(path.join(backup, "_them-moi", "src/moi.ts"))).toBe("file mới");
    expect(read(path.join(root, "data/settings.json"))).toBe('{"cua":"ban"}');
  });

  it("cài tay (giải nén gói đè lên): file bản cũ không còn trong gói sang dự phòng", () => {
    const root = path.join(tmp, "app-tay", "Christmas-MV-Studio");
    put(root, { "src/a.ts": "v2", "src/lib/songsUsed.ts": "bản cũ", "data/settings.json": "{}" });
    const backup = path.join(tmp, "app-tay", "thua");
    // Chưa có danh sách file (máy phát triển / gói cũ) → không động vào gì.
    expect(moveStale(root, backup)).toEqual([]);
    put(root, { "ban-cai.json": JSON.stringify({ commit: "x", files: ["src/a.ts", "ban-cai.json"] }) });
    expect(moveStale(root, backup)).toEqual(["src/lib/songsUsed.ts"]);
    expect(existsSync(path.join(root, "src/lib/songsUsed.ts"))).toBe(false);
    expect(read(path.join(backup, "src/lib/songsUsed.ts"))).toBe("bản cũ");
    expect(read(path.join(root, "src/a.ts"))).toBe("v2");
    expect(read(path.join(root, "data/settings.json"))).toBe("{}");
  });

  it("giữ 3 bản dự phòng mới nhất, cũ hơn vào Thùng rác", () => {
    const dir = path.join(tmp, "prune");
    for (let i = 1; i <= 5; i++) {
      mkdirSync(path.join(dir, `cu-${i}`), { recursive: true });
      utimesSync(path.join(dir, `cu-${i}`), i * 1000, i * 1000);
    }
    pruneOld(dir);
    expect(readdirSync(dir).sort()).toEqual(["cu-3", "cu-4", "cu-5"]);
    expect(readdirSync(process.env.MV_TRASH_DIR!).length).toBe(2);
  });
});

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

describe.skipIf(process.platform === "linux")("tự cập nhật từ GitHub (máy chủ giả)", () => {
  it("hỏi bản mới → tải, giải nén, kiểm tra → chờ rảnh → ghi chờ cài, tự tắt mã 75; nhớ bản lỗi; gói tải lên", async () => {
    const OLD = "a".repeat(40);
    const NEW = "b".repeat(40);
    // Thư mục app giả (không có .git) đang chạy bản OLD.
    const root = path.join(tmp, "may-chay", "Christmas-MV-Studio");
    put(root, { "ban-cai.json": JSON.stringify({ commit: OLD, date: "2026-10-20T00:00:00Z", source: "goi" }) });
    process.env.MVS_APP_ROOT = root;
    process.env.GITHUB_UPDATE_TOKEN = "test_token_0123456789abcdef";
    writeFileSync(path.join(dataDir, "settings.json"), JSON.stringify({ ...JSON.parse(read(path.join("data", "settings.json"))), updateRepo: "chu/repo", updateBranch: "christmas", autoUpdate: true }));

    // Gói mã nguồn kiểu GitHub: một thư mục "chu-repo-<mã ngắn>".
    const src = path.join(tmp, "zipball");
    const appFiles = { "package.json": '{"name":"christmas-mv-studio"}', "package-lock.json": "{}", "scripts/start.mjs": "", "scripts/cap-nhat.mjs": "", "src/app/layout.tsx": "" };
    put(path.join(src, "chu-repo-bbbbbbb"), appFiles);
    const zipball = path.join(tmp, "zipball.zip");
    zip(src, "chu-repo-bbbbbbb", zipball);

    const seen: string[] = [];
    const port = await freePort();
    const api = http.createServer((req, res) => {
      seen.push(`${req.url} ${req.headers.authorization ?? ""}`);
      const json = (o: unknown) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(o));
      if (req.url === "/repos/chu/repo/commits/christmas") json({ sha: NEW, commit: { message: "Bản mới\n\nchi tiết", committer: { date: "2026-10-23T08:00:00Z" } } });
      else if (req.url === `/repos/chu/repo/compare/${OLD}...${NEW}`) json({ status: "ahead", commits: [{ commit: { message: "Sửa A" } }, { commit: { message: "Bản mới\n\nchi tiết" } }] });
      else if (req.url === `/repos/chu/repo/zipball/${NEW}`) res.writeHead(200, { "content-type": "application/zip" }).end(readFileSync(zipball));
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => api.listen(port, "127.0.0.1", r));
    process.env.MVS_GITHUB_API = `http://127.0.0.1:${port}`;

    const up = await import("@/lib/updater");
    expect(up.isGitCheckout()).toBe(false);
    expect(up.currentVersion().commit).toBe(OLD);
    await up.checkUpdate(true);
    let st = await up.updateStatus();
    expect(st.error).toBeNull();
    expect(st.latest).toMatchObject({ sha: NEW, newer: true, message: "Bản mới", changes: ["Bản mới", "Sửa A"] });
    expect(st.ready).toMatchObject({ sha: NEW, source: "github" });
    expect(seen.every((s) => s.endsWith("Bearer test_token_0123456789abcdef"))).toBe(true);
    const staged = path.join(path.dirname(root), "Christmas-MV-Studio-cap-nhat", `moi-${NEW.slice(0, 12)}`);
    expect(existsSync(staged)).toBe(true);
    expect(st.hasToken).toBe(true);
    expect(JSON.stringify(st)).not.toContain("test_token");

    // Không chạy bằng trình khởi động → không tự tắt.
    delete process.env.MVS_SUPERVISOR;
    expect(await up.installWhenIdle()).toMatchObject({ started: false, reason: expect.stringContaining("Chay-Christmas-MV-Studio.bat") });
    // Đang bận (batch) → chờ.
    process.env.MVS_SUPERVISOR = "2";
    const { batchEngine } = await import("@/lib/batchEngine");
    batchEngine.running = true;
    expect(await up.installWhenIdle()).toEqual({ started: false, reason: "đang chạy batch" });
    batchEngine.running = false;
    // Rảnh → ghi chờ cài rồi tự tắt mã 75.
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    expect(await up.installWhenIdle()).toEqual({ started: true });
    const pending = JSON.parse(read(path.join(path.dirname(root), "Christmas-MV-Studio-cap-nhat", "cho-cai.json")));
    expect(pending).toMatchObject({ sha: NEW, source: "github", branch: "christmas" });
    expect(existsSync(path.join(pending.dir, "package.json"))).toBe(true);
    await new Promise((r) => setTimeout(r, 700));
    expect(exit).toHaveBeenCalledWith(75);
    exit.mockRestore();

    // Trình khởi động báo cài lỗi → nhớ bản lỗi, không tự tải lại bản đó.
    writeFileSync(path.join(path.dirname(root), "Christmas-MV-Studio-cap-nhat", "ket-qua.json"), JSON.stringify({ at: "2026-10-23T09:00:00Z", ok: false, sha: NEW, error: "build lỗi", rolledBack: true }));
    st = await up.updateStatus();
    expect(st.bad).toContain(NEW);
    expect(st.ready).toBeNull();
    expect(st.lastResult).toMatchObject({ ok: false, rolledBack: true });
    seen.length = 0;
    await up.checkUpdate(false);
    expect(seen.some((s) => s.includes("/zipball/"))).toBe(false);

    // Gói tải lên (Dong-goi): mã commit lấy từ ban-cai.json trong gói; tải lên = muốn cài.
    const goi = path.join(tmp, "goi");
    put(path.join(goi, "Christmas-MV-Studio"), { ...appFiles, "ban-cai.json": JSON.stringify({ commit: "c".repeat(40), date: "2026-10-23T10:00:00Z", branch: "christmas" }) });
    zip(goi, "Christmas-MV-Studio", path.join(tmp, "goi.zip"));
    await up.stageUpload(readFileSync(path.join(tmp, "goi.zip")), "Christmas-MV-Studio-cap-nhat.zip");
    st = await up.updateStatus();
    expect(st.ready).toMatchObject({ sha: "c".repeat(40), source: "goi" });
    expect(st.wanted).toBe(true);
    // Không phải gói của app → từ chối.
    await expect(up.stageUpload(Buffer.from("không phải zip"), "x.zip")).rejects.toThrow(/không phải gói/);

    await new Promise((r) => api.close(r));
  }, 60000);
});
