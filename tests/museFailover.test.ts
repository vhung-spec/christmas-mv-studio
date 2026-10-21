// Tự đổi sang tài khoản Muse dự phòng khi tài khoản đang dùng bị lỗi (không đổi khi chỉ hết lượt).
// Muse giả đọc trạng thái theo hồ sơ đang dùng (thư mục của tài khoản đang dùng): file "logged-out" = bị đăng xuất,
// file "refuse" = Muse từ chối nhận lệnh (nội dung = lý do).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { activeProfileDir } from "@/lib/museEngine";
import type { Attachment } from "@/lib/museEngine/page";
import { FAST, FakeMuse, waitFor } from "./fakeMuse";

const tmp = mkdtempSync(path.join(tmpdir(), "mvps-failover-"));
const dir = path.join(tmp, "muse");
const active = (name: string) => path.join(activeProfileDir(dir), name);

class ProfileMuse extends FakeMuse {
  async login() {
    return { loggedIn: !existsSync(active("logged-out")) };
  }
  async send(text: string, atts: Attachment[]) {
    if (existsSync(active("refuse"))) return { ok: false, sessionId: "", reason: readFileSync(active("refuse"), "utf8") };
    return super.send(text, atts);
  }
}

const T = { logoutGraceMs: 1000, reopenAfterMs: 1000, refusalWindowMs: 3600e3, minGapMs: 2000 };
let fake: ProfileMuse;
let clock = Date.now();
const later = (ms: number) => (clock += ms);

beforeAll(async () => {
  for (const [folder, who] of [["chrome-profile", "chinh"], ["chrome-profile-b1", "b1"], ["chrome-profile-b2", "b2"]]) {
    mkdirSync(path.join(dir, folder), { recursive: true });
    writeFileSync(path.join(dir, folder, "who.txt"), who);
  }
  fake = new ProfileMuse();
  (await import("@/lib/museEngine")).initMuseEngine({ dir, page: fake, worker: FAST });
  const acc = await import("@/lib/museEngine/accounts");
  await acc.setMuseFailover(true);
  await acc.setMuseBackup("b1", true);
  await acc.setMuseBackup("b2", true);
});
afterAll(async () => {
  await (await import("@/lib/museEngine")).closeMuseEngine();
  rmSync(tmp, { recursive: true, force: true });
});
beforeEach(async () => (await import("@/lib/museEngine/accounts")).resetFailoverState());

const who = () => readFileSync(active("who.txt"), "utf8");
async function addShot(label: string) {
  const { museEngine } = await import("@/lib/museEngine");
  const t = museEngine().store.add({ label, prompt: `A shot ${label}`, kind: "video", ratio: "16:9", images: [] });
  museEngine().worker.pump();
  return t.id;
}

describe("tự đổi tài khoản Muse khi tài khoản lỗi", { timeout: 30000 }, () => {
  it("bị đăng xuất: chưa đủ thời gian thì chờ; quá hạn mà kiểm tra lại vẫn chưa đăng nhập → đổi sang dự phòng đầu tiên", async () => {
    const { museEngine } = await import("@/lib/museEngine");
    const acc = await import("@/lib/museEngine/accounts");
    writeFileSync(active("logged-out"), "");
    const id = await addShot("1");
    await waitFor(() => museEngine().worker.state.loggedIn === false, 5000, "phát hiện đăng xuất");
    expect(await acc.failoverTick(later(0), T)).toBeNull();
    expect(await acc.failoverTick(later(500), T)).toBeNull();
    const ev = await acc.failoverTick(later(1000), T);
    expect(ev).toMatchObject({ kind: "switch", from: "Tài khoản 1", to: "Hồ sơ cất tay (b1)" });
    expect(who()).toBe("b1");
    const v = await acc.museAccounts();
    expect(v.active.id).toBe("b1");
    expect(v.others.find((a) => a.id === "tk1")?.broken?.reason).toMatch(/chưa đăng nhập/);
    // Tài khoản mới đăng nhập được → cảnh được gửi.
    await waitFor(() => museEngine().store.get(id)?.status === "processing" && Boolean(museEngine().store.get(id)?.sessionId), 5000, "gửi bằng tài khoản dự phòng");
    fake.finish(fake.sent.length);
    await waitFor(() => museEngine().store.get(id)?.status === "succeeded", 5000, "cảnh xong");
  });

  it("chỉ HẾT LƯỢT tuần thì không đổi tài khoản", async () => {
    const { museEngine } = await import("@/lib/museEngine");
    const acc = await import("@/lib/museEngine/accounts");
    writeFileSync(active("refuse"), "You've reached your weekly usage limit. Upgrade to continue.");
    await addShot("2");
    await waitFor(() => Boolean(museEngine().worker.state.limitHit), 5000, "Muse báo hết lượt");
    expect(await acc.failoverTick(later(10_000), T)).toBeNull();
    expect(who()).toBe("b1");
    // Hết lượt xong (tuần mới).
    rmSync(active("refuse"));
    await museEngine().worker.check();
    await waitFor(() => museEngine().store.list().some((t) => t.label === "2" && t.status === "processing"), 5000, "chạy tiếp");
    fake.finish(fake.sent.length);
    await waitFor(() => museEngine().store.list().every((t) => t.status === "succeeded"), 5000, "xong hết");
  });

  it("Muse từ chối 3 lệnh liên tiếp (không phải hết lượt) → đổi sang dự phòng kế tiếp và gửi lại 3 cảnh đó", async () => {
    const { museEngine } = await import("@/lib/museEngine");
    const acc = await import("@/lib/museEngine/accounts");
    writeFileSync(active("refuse"), "This account has been restricted.");
    const ids = [await addShot("3a"), await addShot("3b"), await addShot("3c")];
    await waitFor(() => ids.every((i) => museEngine().store.get(i)?.status === "failed"), 5000, "3 cảnh bị từ chối");
    const sentBefore = fake.sent.length;
    const ev = await acc.failoverTick(later(5000), T);
    expect(ev).toMatchObject({ kind: "switch", from: "Hồ sơ cất tay (b1)", to: "Hồ sơ cất tay (b2)", reason: expect.stringMatching(/restricted/) });
    expect(who()).toBe("b2");
    // Muse làm lần lượt từng cảnh: cảnh nào được gửi lại thì cho xong rồi tới cảnh sau.
    for (let k = 1; k <= 3; k++) {
      await waitFor(() => fake.sent.length >= sentBefore + k, 5000, `gửi lại cảnh thứ ${k} bằng tài khoản mới`);
      fake.finish(sentBefore + k);
    }
    await waitFor(() => ids.every((i) => museEngine().store.get(i)?.status === "succeeded"), 5000, "3 cảnh xong");
  });

  it("hết tài khoản dự phòng → ghi lại, không đổi, không báo lặp", async () => {
    const { museEngine } = await import("@/lib/museEngine");
    const acc = await import("@/lib/museEngine/accounts");
    writeFileSync(active("refuse"), "This account has been restricted.");
    const ids = [await addShot("4a"), await addShot("4b"), await addShot("4c")];
    await waitFor(() => ids.every((i) => museEngine().store.get(i)?.status === "failed"), 5000, "3 cảnh bị từ chối");
    const ev = await acc.failoverTick(later(5000), T);
    expect(ev).toMatchObject({ kind: "none-left", from: "Hồ sơ cất tay (b2)" });
    expect(who()).toBe("b2");
    expect(await acc.failoverTick(later(5000), T)).toBeNull();
    expect((await acc.museAccounts()).events[0].kind).toBe("none-left");
    rmSync(active("refuse"));
  });

  it("Chrome của Muse bị tắt bất thường → sau một lúc tự mở lại (cùng tài khoản)", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    await addShot("5");
    fake.userCloses();
    expect(await acc.failoverTick(later(0), T)).toBeNull();
    expect(await acc.failoverTick(later(1000), T)).toMatchObject({ kind: "reopen" });
    expect(who()).toBe("b2");
  });

  it("tắt chức năng → không làm gì", async () => {
    const acc = await import("@/lib/museEngine/accounts");
    await acc.setMuseFailover(false);
    writeFileSync(active("logged-out"), "");
    expect(await acc.failoverTick(later(10_000), T)).toBeNull();
    expect(await acc.failoverTick(later(10_000), T)).toBeNull();
    expect(who()).toBe("b2");
  });
});
