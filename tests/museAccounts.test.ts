// Tài khoản Muse: mỗi tài khoản một thư mục hồ sơ cố định (không đổi tên thư mục), đổi bằng một nút, thêm mới, xoá → Thùng rác;
// cảnh đang làm chỉ gửi lại khi người dùng đồng ý. Dùng Muse giả (không mở Chrome) + thư mục tạm; "hồ sơ Chrome" = thư mục có
// file who.txt ghi tên tài khoản.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAST, FakeMuse, waitFor } from "./fakeMuse";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-accounts-"));
const dir = path.join(tmp, "muse");
const trash = path.join(tmp, "thung-rac");
process.env.MV_TRASH_DIR = trash;
const profile = (folder: string) => path.join(dir, folder);

let fake: FakeMuse;
let activeDir: (d: string) => string;
const who = () => readFileSync(path.join(activeDir(dir), "who.txt"), "utf8");

beforeAll(async () => {
  mkdirSync(profile("chrome-profile"), { recursive: true });
  writeFileSync(path.join(profile("chrome-profile"), "who.txt"), "tai-khoan-chinh");
  // Hồ sơ người dùng đã cất tay theo hướng dẫn cũ.
  mkdirSync(profile("chrome-profile-cu"), { recursive: true });
  writeFileSync(path.join(profile("chrome-profile-cu"), "who.txt"), "tai-khoan-cu");
  fake = new FakeMuse();
  const eng = await import("@/lib/museEngine");
  activeDir = eng.activeProfileDir;
  eng.initMuseEngine({ dir, page: fake, worker: FAST });
});
afterAll(async () => {
  await (await import("@/lib/museEngine")).closeMuseEngine();
  rmSync(tmp, { recursive: true, force: true });
});

describe("tài khoản Muse", () => {
  it("lần đầu: tài khoản đang dùng là “Tài khoản 1” (thư mục chrome-profile), nhận thư mục hồ sơ cất tay", async () => {
    const { museAccounts } = await import("@/lib/museEngine/accounts");
    const v = await museAccounts();
    expect([v.active.name, v.active.folder]).toEqual(["Tài khoản 1", "chrome-profile"]);
    expect(v.others.map((a) => [a.name, a.folder])).toEqual([["Hồ sơ cất tay (cu)", "chrome-profile-cu"]]);
    expect(who()).toBe("tai-khoan-chinh");
  });

  it("đổi tài khoản chỉ đổi thư mục Chrome mở — không đổi tên thư mục nào", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    const before = readdirSync(dir).sort();
    const other = (await acc.museAccounts()).others[0];
    expect(await acc.switchMuseAccount({ to: other.id })).toMatchObject({ ok: true, requeued: 0 });
    expect(activeDir(dir)).toBe(profile("chrome-profile-cu"));
    expect(who()).toBe("tai-khoan-cu");
    expect(readdirSync(dir).filter((f) => f.startsWith("chrome-profile")).sort()).toEqual(before.filter((f) => f.startsWith("chrome-profile")));
    await acc.switchMuseAccount({ to: "tk1" });
    expect(who()).toBe("tai-khoan-chinh");
  });

  it("có cảnh đang làm → hỏi trước; đồng ý thì thêm tài khoản mới (thư mục riêng) và gửi lại cảnh đó", async () => {
    const { museEngine } = await import("@/lib/museEngine");
    const acc = await import("@/lib/museEngine/accounts");
    const task = museEngine().store.add({ label: "MV 1 · cảnh 1", prompt: "A couple on the pier", kind: "video", ratio: "16:9", images: [] });
    museEngine().worker.pump();
    await waitFor(() => museEngine().store.get(task.id)?.status === "processing" && Boolean(museEngine().store.get(task.id)?.sessionId), 5000, "Muse nhận cảnh");
    const sentBefore = fake.sent.length;

    expect(await acc.switchMuseAccount({ add: "TK phụ" })).toEqual({ ok: false, needsConfirm: true, inflight: 1 });
    expect(existsSync(profile("chrome-profile--tk-phu"))).toBe(false); // chưa đổi gì

    const r = await acc.switchMuseAccount({ add: "TK phụ" }, true);
    expect(r).toMatchObject({ ok: true, requeued: 1, active: { name: "TK phụ", folder: "chrome-profile--tk-phu" } });
    expect(activeDir(dir)).toBe(profile("chrome-profile--tk-phu"));
    expect(readdirSync(profile("chrome-profile--tk-phu"))).toEqual([]); // hồ sơ trống, chờ đăng nhập
    expect(readFileSync(path.join(profile("chrome-profile"), "who.txt"), "utf8")).toBe("tai-khoan-chinh"); // hồ sơ cũ còn nguyên
    await waitFor(() => fake.sent.length > sentBefore, 5000, "gửi lại bằng tài khoản mới");
    const t = museEngine().store.get(task.id)!;
    expect([t.status, t.attempts]).toEqual(["processing", 1]);
  });

  it("xoá tài khoản: hồ sơ vào Thùng rác; không xoá được tài khoản đang dùng", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    await expect(acc.deleteMuseAccount("tk-phu")).rejects.toThrow(/Đang dùng tài khoản này/);
    const cu = (await acc.museAccounts()).others.find((a) => a.folder === "chrome-profile-cu")!;
    await acc.deleteMuseAccount(cu.id);
    expect(existsSync(profile("chrome-profile-cu"))).toBe(false);
    const binned = readdirSync(trash);
    expect(binned).toHaveLength(1);
    expect(readFileSync(path.join(trash, binned[0], "who.txt"), "utf8")).toBe("tai-khoan-cu");
    expect((await acc.museAccounts()).others.map((a) => a.id)).toEqual(["tk1"]);
  });

  it("đổi tên tài khoản", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    await acc.renameMuseAccount("tk1", "TK chính (bị khoá)");
    expect((await acc.museAccounts()).others.find((a) => a.id === "tk1")?.name).toBe("TK chính (bị khoá)");
  });
});
