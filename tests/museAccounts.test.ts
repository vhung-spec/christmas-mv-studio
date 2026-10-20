// Tài khoản Muse: lưu nhiều hồ sơ, đổi bằng một nút, thêm tài khoản mới; cảnh đang làm chỉ gửi lại khi người dùng đồng ý.
// Dùng Muse giả (không mở Chrome) + thư mục tạm; "hồ sơ Chrome" là thư mục có file đánh dấu tên tài khoản.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FAST, FakeMuse, waitFor } from "./fakeMuse";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-accounts-"));
const dir = path.join(tmp, "muse");
const profile = (folder: string) => path.join(dir, folder);
const owner = (folder: string) => readFileSync(path.join(profile(folder), "who.txt"), "utf8");

let fake: FakeMuse;
beforeAll(async () => {
  mkdirSync(profile("chrome-profile"), { recursive: true });
  writeFileSync(path.join(profile("chrome-profile"), "who.txt"), "tai-khoan-chinh");
  // Hồ sơ người dùng đã cất tay theo hướng dẫn cũ.
  mkdirSync(profile("chrome-profile-cu"), { recursive: true });
  writeFileSync(path.join(profile("chrome-profile-cu"), "who.txt"), "tai-khoan-cu");
  fake = new FakeMuse();
  (await import("@/lib/museEngine")).initMuseEngine({ dir, page: fake, worker: FAST });
});
afterAll(async () => {
  await (await import("@/lib/museEngine")).closeMuseEngine();
  rmSync(tmp, { recursive: true, force: true });
});

describe("tài khoản Muse", () => {
  it("lần đầu: tài khoản đang dùng là “Tài khoản 1”, nhận thư mục hồ sơ cất tay", async () => {
    const { museAccounts } = await import("@/lib/museEngine/accounts");
    const v = await museAccounts();
    expect(v.active.name).toBe("Tài khoản 1");
    expect(v.others.map((a) => [a.name, a.folder])).toEqual([["Hồ sơ cất tay (cu)", "chrome-profile-cu"]]);
  });

  it("đổi sang hồ sơ đã cất: thư mục được đổi tên đúng, không mất hồ sơ nào", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    const other = (await acc.museAccounts()).others[0];
    const r = await acc.switchMuseAccount({ to: other.id });
    expect(r).toMatchObject({ ok: true, requeued: 0 });
    expect(owner("chrome-profile")).toBe("tai-khoan-cu");
    expect(owner("chrome-profile--tk1")).toBe("tai-khoan-chinh");
    const v = await acc.museAccounts();
    expect(v.active.id).toBe(other.id);
    expect(v.others.map((a) => [a.id, a.folder])).toEqual([["tk1", "chrome-profile--tk1"]]);
    // Đổi về tài khoản 1.
    await acc.switchMuseAccount({ to: "tk1" });
    expect(owner("chrome-profile")).toBe("tai-khoan-chinh");
    expect(owner(`chrome-profile--${other.id}`)).toBe("tai-khoan-cu");
  });

  it("có cảnh đang làm → hỏi trước; đồng ý thì cảnh đó về hàng chờ và gửi lại bằng tài khoản mới", async () => {
    const { museEngine } = await import("@/lib/museEngine");
    const acc = await import("@/lib/museEngine/accounts");
    const task = museEngine().store.add({ label: "MV 1 · cảnh 1", prompt: "A couple on the pier", kind: "video", ratio: "16:9", images: [] });
    museEngine().worker.pump();
    await waitFor(() => museEngine().store.get(task.id)?.status === "processing" && Boolean(museEngine().store.get(task.id)?.sessionId), 5000, "Muse nhận cảnh");
    const sentBefore = fake.sent.length;

    const ask = await acc.switchMuseAccount({ add: "TK phụ" });
    expect(ask).toEqual({ ok: false, needsConfirm: true, inflight: 1 });
    expect(existsSync(profile("chrome-profile--tk-phu"))).toBe(false); // chưa đổi gì

    const r = await acc.switchMuseAccount({ add: "TK phụ" }, true);
    expect(r).toMatchObject({ ok: true, requeued: 1, active: { name: "TK phụ" } });
    // Hồ sơ tài khoản 1 được cất, hồ sơ mới trống (Chrome tạo khi đăng nhập).
    expect(owner("chrome-profile--tk1")).toBe("tai-khoan-chinh");
    expect(existsSync(path.join(profile("chrome-profile"), "who.txt"))).toBe(false);
    // Cảnh dở được gửi lại bằng tài khoản mới (lần gửi mới, không bị tính là lần thử hỏng).
    await waitFor(() => fake.sent.length > sentBefore, 5000, "gửi lại bằng tài khoản mới");
    const t = museEngine().store.get(task.id)!;
    expect(t.status).toBe("processing");
    expect(t.attempts).toBe(1);
    expect(t.sessionId).toBe(`sess_${fake.sent.length}`);
  });

  it("tài khoản chưa từng mở Chrome (chưa có hồ sơ) vẫn đổi đi rồi đổi về được", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    // "TK phụ" đang dùng, chưa có thư mục chrome-profile (Muse giả không tạo).
    rmSync(profile("chrome-profile"), { recursive: true, force: true });
    await acc.switchMuseAccount({ to: "tk1" }, true);
    expect(owner("chrome-profile")).toBe("tai-khoan-chinh");
    expect(existsSync(profile("chrome-profile--tk-phu"))).toBe(true);
    await acc.switchMuseAccount({ to: "tk-phu" }, true);
    expect((await acc.museAccounts()).active.name).toBe("TK phụ");
    expect(owner("chrome-profile--tk1")).toBe("tai-khoan-chinh");
  });

  it("đổi tên tài khoản", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    await acc.renameMuseAccount("tk1", "TK chính (bị khoá)");
    expect((await acc.museAccounts()).others.find((a) => a.id === "tk1")?.name).toBe("TK chính (bị khoá)");
  });
});
