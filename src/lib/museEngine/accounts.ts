// TÀI KHOẢN MUSE — mỗi tài khoản một hồ sơ Chrome riêng (giữ phiên đăng nhập). App luôn chạy bằng thư mục "chrome-profile";
// các tài khoản khác được cất trong "chrome-profile--<mã>" (hoặc thư mục bạn tự cất tay, vd. "chrome-profile-cu").
// Đổi tài khoản = dừng nhận việc, (nếu bạn đồng ý) đưa các cảnh đang làm về hàng chờ để gửi lại bằng tài khoản mới, đóng Chrome,
// đổi tên thư mục, mở lại. Không xoá hồ sơ nào. Danh sách lưu ở accounts.json trong thư mục dữ liệu Muse.
// Dùng khi một tài khoản bị lỗi / bị khoá — không phải để luân phiên nhiều tài khoản lách hạn mức tuần.

import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { museEngine, restartMuseEngine } from "./index";
import type { WorkerState } from "./runner";

export const ACTIVE_PROFILE = "chrome-profile";

export interface MuseAccount {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string;
  /** Thư mục đang cất hồ sơ (tài khoản không dùng). Tài khoản đang dùng: không có. */
  folder?: string;
  /** Tình trạng lúc cất, vd. "Muse báo hết lượt (20/10 14:05)". */
  last_state?: string;
}

interface AccountsFile {
  active: string;
  accounts: MuseAccount[];
}

export interface AccountsView {
  active: MuseAccount;
  others: MuseAccount[];
  /** Số cảnh Muse đang làm (đổi tài khoản lúc này thì các cảnh đó phải gửi lại). */
  inflight: number;
}

export type SwitchResult = { ok: true; active: MuseAccount; requeued: number } | { ok: false; needsConfirm: true; inflight: number };

const file = (dir: string) => path.join(/*turbopackIgnore: true*/ dir, "accounts.json");
const now = () => new Date().toISOString();
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "tk";

/** Đọc danh sách; lần đầu tạo "Tài khoản 1" cho hồ sơ đang dùng và nhận các thư mục hồ sơ đã cất tay. */
async function load(dir: string): Promise<AccountsFile> {
  let data: AccountsFile | null = null;
  try {
    data = JSON.parse(await fs.readFile(file(dir), "utf8")) as AccountsFile;
  } catch {
    data = null;
  }
  if (!data?.accounts?.length) data = { active: "tk1", accounts: [{ id: "tk1", name: "Tài khoản 1", created_at: now(), last_used_at: now() }] };
  // Thư mục hồ sơ cất tay (vd. "chrome-profile-cu") chưa có trong danh sách → thêm vào.
  const known = new Set(data.accounts.map((a) => a.folder).filter(Boolean));
  const folders = await fs.readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
  for (const f of folders) {
    if (!f.startsWith(`${ACTIVE_PROFILE}-`) || known.has(f)) continue;
    if (!(await fs.stat(path.join(/*turbopackIgnore: true*/ dir, f)).then((s) => s.isDirectory(), () => false))) continue;
    const label = f.slice(ACTIVE_PROFILE.length).replace(/^-+/, "");
    let id = slug(label);
    while (data.accounts.some((a) => a.id === id)) id += "x";
    data.accounts.push({ id, name: `Hồ sơ cất tay (${label})`, created_at: now(), last_used_at: "", folder: f });
  }
  return data;
}

async function save(dir: string, data: AccountsFile) {
  await fs.writeFile(file(dir), JSON.stringify(data, null, 2), "utf8");
}

/** Đổi tên thư mục; Chrome vừa tắt có thể còn giữ file vài giây → thử lại tới ~20 giây. */
async function renameDir(from: string, to: string) {
  for (let i = 0; ; i++) {
    try {
      return await fs.rename(from, to);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (i >= 20 || !["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(code)) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

function describe(state: WorkerState): string | undefined {
  const at = new Date().toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (state.limitHit) return `Muse báo hết lượt (${new Date(state.limitHit.at).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })})`;
  if (state.loggedIn === false) return `Chưa đăng nhập / phiên hết hạn (${at})`;
  if (state.paused) return `Đang dừng: ${state.paused.slice(0, 120)} (${at})`;
  return undefined;
}

export async function museAccounts(): Promise<AccountsView> {
  const e = museEngine();
  const data = await load(e.dir);
  const active = data.accounts.find((a) => a.id === data.active) ?? data.accounts[0];
  return {
    active,
    others: data.accounts.filter((a) => a.id !== active.id).sort((a, b) => (b.last_used_at || "").localeCompare(a.last_used_at || "")),
    inflight: e.store.list().filter((t) => t.status === "processing").length,
  };
}

/**
 * Đổi sang tài khoản đã lưu ({ to: id }) hoặc thêm tài khoản mới ({ add: tên }, hồ sơ trống → mở cửa sổ đăng nhập).
 * Đang có cảnh Muse đang làm mà chưa `force` → trả needsConfirm; `force` → các cảnh đó về hàng chờ, gửi lại bằng tài khoản mới.
 */
export async function switchMuseAccount(req: { to: string } | { add: string }, force = false): Promise<SwitchResult> {
  const e = museEngine();
  const dir = e.dir;
  const data = await load(dir);
  const cur = data.accounts.find((a) => a.id === data.active) ?? data.accounts[0];
  let target: MuseAccount;
  if ("to" in req) {
    const t = data.accounts.find((a) => a.id === req.to);
    if (!t) throw new Error("Không có tài khoản này.");
    if (t.id === cur.id) return { ok: true, active: cur, requeued: 0 };
    // Thư mục hồ sơ bị mất (vd. xoá tay) → dùng hồ sơ trống, đăng nhập lại.
    if (t.folder && !existsSync(path.join(/*turbopackIgnore: true*/ dir, t.folder))) t.folder = undefined;
    target = t;
  } else {
    const name = req.add.trim().slice(0, 60) || `Tài khoản ${data.accounts.length + 1}`;
    let id = slug(name);
    while (data.accounts.some((a) => a.id === id)) id += "x";
    target = { id, name, created_at: now(), last_used_at: "" };
    data.accounts.push(target);
  }

  const inflight = e.store.list().filter((t) => t.status === "processing");
  if (inflight.length && !force) return { ok: false, needsConfirm: true, inflight: inflight.length };

  cur.last_state = describe(e.worker.state);
  cur.last_used_at = now();
  // Cảnh đang làm bằng tài khoản cũ: tài khoản mới không đọc được phiên chat cũ → về hàng chờ, gửi lại (không tính là lần thử hỏng).
  for (const t of inflight) {
    e.store.update(t.id, {
      status: "queued",
      sessionId: "",
      step: "",
      pollErrors: 0,
      attempts: Math.max(0, t.attempts - 1),
      error: `Đã đổi sang tài khoản Muse “${target.name}” — gửi lại bằng tài khoản này.`,
    });
  }

  await restartMuseEngine(async () => {
    const active = path.join(/*turbopackIgnore: true*/ dir, ACTIVE_PROFILE);
    let stash = `${ACTIVE_PROFILE}--${cur.id}`;
    if (existsSync(path.join(/*turbopackIgnore: true*/ dir, stash))) stash += `-${Date.now().toString(36)}`;
    // Tài khoản chưa từng mở Chrome thì chưa có hồ sơ → cất một thư mục trống để vẫn đổi về được (đăng nhập lại).
    if (existsSync(active)) await renameDir(active, path.join(/*turbopackIgnore: true*/ dir, stash));
    else await fs.mkdir(path.join(/*turbopackIgnore: true*/ dir, stash), { recursive: true });
    cur.folder = stash;
    if (target.folder) {
      await renameDir(path.join(/*turbopackIgnore: true*/ dir, target.folder), active);
      target.folder = undefined;
    }
    data.active = target.id;
    target.last_used_at = now();
    target.last_state = undefined;
    await save(dir, data);
  });

  const fresh = museEngine();
  // Tài khoản mới (hồ sơ trống): mở cửa sổ đăng nhập. Tài khoản đã lưu: kiểm tra đăng nhập rồi chạy tiếp hàng chờ.
  if ("add" in req) void fresh.worker.login();
  else void fresh.worker.check().catch(() => {});
  return { ok: true, active: target, requeued: inflight.length };
}

export async function renameMuseAccount(id: string, name: string): Promise<void> {
  const dir = museEngine().dir;
  const data = await load(dir);
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new Error("Không có tài khoản này.");
  a.name = name.trim().slice(0, 60) || a.name;
  await save(dir, data);
}
