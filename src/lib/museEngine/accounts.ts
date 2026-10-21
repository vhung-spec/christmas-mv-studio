// TÀI KHOẢN MUSE — mỗi tài khoản một thư mục hồ sơ Chrome CỐ ĐỊNH (giữ phiên đăng nhập): tài khoản đầu là "chrome-profile",
// tài khoản thêm sau là "chrome-profile--<mã>" (thư mục bạn tự cất tay, vd. "chrome-profile-cu", cũng được nhận).
// Đổi tài khoản = dừng nhận việc, (nếu bạn đồng ý) đưa các cảnh đang làm về hàng chờ để gửi lại bằng tài khoản mới, đóng Chrome,
// mở lại Chrome bằng thư mục của tài khoản kia — KHÔNG đổi tên thư mục nào (Windows hay chặn đổi tên khi Chrome / File Explorer
// còn giữ file). Xoá tài khoản = hồ sơ của nó vào Thùng rác (không xoá vĩnh viễn). Danh sách: accounts.json trong thư mục dữ liệu Muse.
// Dùng khi một tài khoản bị lỗi / bị khoá — không phải để luân phiên nhiều tài khoản lách hạn mức tuần.

import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { moveToTrash } from "../trash";
import { museEngine, restartMuseEngine } from "./index";
import { LIMIT_RE, type WorkerState } from "./runner";

export const ACTIVE_PROFILE = "chrome-profile";

export interface MuseAccount {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string;
  /** Thư mục hồ sơ Chrome của tài khoản (trong thư mục dữ liệu Muse). */
  folder?: string;
  /** Tình trạng lúc cất, vd. "Muse báo hết lượt (20/10 14:05)". */
  last_state?: string;
  /** Được dùng làm tài khoản dự phòng khi tự đổi. */
  backup?: boolean;
  /** App đã tự đổi khỏi tài khoản này vì lỗi — không tự đổi về (bạn tự chọn lại thì hết đánh dấu). */
  broken?: { at: string; reason: string };
}

export interface FailoverEvent {
  at: string;
  /** switch = đã tự đổi tài khoản · none-left = hết tài khoản dự phòng · reopen = tự mở lại Chrome của Muse. */
  kind: "switch" | "none-left" | "reopen";
  from?: string;
  to?: string;
  reason: string;
}

interface AccountsFile {
  active: string;
  accounts: MuseAccount[];
  /** Tự đổi sang tài khoản dự phòng khi tài khoản đang dùng bị lỗi (không đổi khi chỉ hết lượt). */
  autoFailover?: boolean;
  events?: FailoverEvent[];
}

export interface AccountsView {
  active: MuseAccount;
  others: MuseAccount[];
  /** Số cảnh Muse đang làm (đổi tài khoản lúc này thì các cảnh đó phải gửi lại). */
  inflight: number;
  autoFailover: boolean;
  /** Các lần tự đổi / tự mở lại gần nhất (mới nhất trước). */
  events: FailoverEvent[];
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
  // Bản cũ (đổi tên thư mục): tài khoản đang dùng chưa ghi thư mục = "chrome-profile".
  const act = data.accounts.find((a) => a.id === data.active);
  if (act && !act.folder) act.folder = ACTIVE_PROFILE;
  // Thư mục hồ sơ cất tay (vd. "chrome-profile-cu") chưa có trong danh sách → thêm vào.
  const known = new Set(data.accounts.map((a) => a.folder).filter(Boolean));
  const folders = await fs.readdir(/*turbopackIgnore: true*/ dir).catch(() => [] as string[]);
  for (const f of folders) {
    if (!(f === ACTIVE_PROFILE || f.startsWith(`${ACTIVE_PROFILE}-`)) || known.has(f)) continue;
    if (!(await fs.stat(path.join(/*turbopackIgnore: true*/ dir, f)).then((s) => s.isDirectory(), () => false))) continue;
    const label = f.slice(ACTIVE_PROFILE.length).replace(/^-+/, "") || "cũ";
    let id = slug(label);
    while (data.accounts.some((a) => a.id === id)) id += "x";
    data.accounts.push({ id, name: `Hồ sơ cất tay (${label})`, created_at: now(), last_used_at: "", folder: f });
  }
  return data;
}

async function save(dir: string, data: AccountsFile) {
  await fs.writeFile(file(dir), JSON.stringify(data, null, 2), "utf8");
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
    autoFailover: Boolean(data.autoFailover),
    events: (data.events ?? []).slice(0, 10),
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
    target = t;
  } else {
    const name = req.add.trim().slice(0, 60) || `Tài khoản ${data.accounts.length + 1}`;
    let id = slug(name);
    while (data.accounts.some((a) => a.id === id)) id += "x";
    let folder = `${ACTIVE_PROFILE}--${id}`;
    while (existsSync(path.join(/*turbopackIgnore: true*/ dir, folder))) folder += "x";
    target = { id, name, created_at: now(), last_used_at: "", folder };
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
    // Thư mục của tài khoản đích (mất / chưa có → hồ sơ trống, đăng nhập lại). Chrome mở lại bằng thư mục này — không đổi tên gì.
    target.folder ??= `${ACTIVE_PROFILE}--${target.id}`;
    await fs.mkdir(path.join(/*turbopackIgnore: true*/ dir, target.folder), { recursive: true });
    data.active = target.id;
    target.last_used_at = now();
    target.last_state = undefined;
    target.broken = undefined;
    await save(dir, data);
  });

  const fresh = museEngine();
  // Tài khoản mới (hồ sơ trống): mở cửa sổ đăng nhập. Tài khoản đã lưu: kiểm tra đăng nhập rồi chạy tiếp hàng chờ.
  if ("add" in req) void fresh.worker.login();
  else void fresh.worker.check().catch(() => {});
  return { ok: true, active: target, requeued: inflight.length };
}

/** Xoá tài khoản không dùng nữa: bỏ khỏi danh sách, hồ sơ Chrome của nó vào Thùng rác (không xoá vĩnh viễn). */
export async function deleteMuseAccount(id: string): Promise<void> {
  const dir = museEngine().dir;
  const data = await load(dir);
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new Error("Không có tài khoản này.");
  if (a.id === data.active) throw new Error("Đang dùng tài khoản này — đổi sang tài khoản khác trước rồi mới xoá.");
  const folder = a.folder ? path.join(/*turbopackIgnore: true*/ dir, a.folder) : null;
  if (folder && existsSync(folder)) {
    await moveToTrash(folder).catch((err) => {
      throw new Error(`Không chuyển được hồ sơ “${a.name}” vào Thùng rác (${(err as Error).message.slice(0, 160)}). Đóng các cửa sổ File Explorer đang mở thư mục đó rồi thử lại.`);
    });
  }
  data.accounts = data.accounts.filter((x) => x.id !== id);
  await save(dir, data);
}

export async function renameMuseAccount(id: string, name: string): Promise<void> {
  const dir = museEngine().dir;
  const data = await load(dir);
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new Error("Không có tài khoản này.");
  a.name = name.trim().slice(0, 60) || a.name;
  await save(dir, data);
}

// ---------- Tự đổi sang tài khoản dự phòng khi tài khoản đang dùng bị lỗi ----------

export async function setMuseFailover(enabled: boolean): Promise<void> {
  const dir = museEngine().dir;
  const data = await load(dir);
  data.autoFailover = enabled;
  await save(dir, data);
}

export async function setMuseBackup(id: string, on: boolean): Promise<void> {
  const dir = museEngine().dir;
  const data = await load(dir);
  const a = data.accounts.find((x) => x.id === id);
  if (!a) throw new Error("Không có tài khoản này.");
  a.backup = on;
  await save(dir, data);
}

/** Ngưỡng tự đổi (test truyền ngưỡng nhỏ). */
export const FAILOVER = {
  /** Bị đăng xuất liên tục chừng này (và kiểm tra lại vẫn chưa đăng nhập) mới coi là tài khoản lỗi. */
  logoutGraceMs: 10 * 60e3,
  /** Chrome của Muse bị đóng / tắt bất thường chừng này thì tự mở lại. */
  reopenAfterMs: 5 * 60e3,
  /** Xét các cảnh kết thúc trong khoảng này khi đếm "từ chối liên tiếp". */
  refusalWindowMs: 60 * 60e3,
  /** Hai lần tự đổi cách nhau ít nhất chừng này. */
  minGapMs: 30 * 60e3,
};

const fo = ((globalThis as unknown as { __mvMuseFailover?: { loggedOutSince: number; chromeClosedSince: number; lastSwitch: number; noneLeftAt: number; busy: boolean } }).__mvMuseFailover ??= {
  loggedOutSince: 0,
  chromeClosedSince: 0,
  lastSwitch: 0,
  noneLeftAt: 0,
  busy: false,
});

async function logEvent(dir: string, data: AccountsFile, ev: FailoverEvent): Promise<FailoverEvent> {
  data.events = [ev, ...(data.events ?? [])].slice(0, 20);
  await save(dir, data);
  console.warn("[muse]", ev.kind, ev.from ?? "", "→", ev.to ?? "", ev.reason);
  return ev;
}

/**
 * Một lượt kiểm tra (app gọi mỗi 2 phút, chỉ khi đã bật). Không làm gì khi không còn cảnh nào phải làm, hoặc Muse chỉ báo HẾT LƯỢT
 * (chờ như thường — không xoay tài khoản để lách hạn mức). Tài khoản lỗi = bị đăng xuất quá logoutGraceMs (kiểm tra lại vẫn chưa
 * đăng nhập), hoặc 3 cảnh kết thúc gần nhất đều bị Muse từ chối nhận lệnh (không phải vì hết lượt). Khi đó đổi sang tài khoản dự
 * phòng đầu tiên chưa bị đánh dấu lỗi; các cảnh bị từ chối và cảnh đang làm được gửi lại bằng tài khoản mới.
 * Trả về sự kiện vừa xảy ra (hoặc null).
 */
export async function failoverTick(nowMs = Date.now(), t = FAILOVER): Promise<FailoverEvent | null> {
  if (fo.busy) return null;
  fo.busy = true;
  try {
    const e = museEngine();
    const data = await load(e.dir);
    if (!data.autoFailover) {
      fo.loggedOutSince = fo.chromeClosedSince = 0;
      return null;
    }
    const st = e.worker.state;
    const tasks = e.store.list();
    // 3 cảnh kết thúc gần nhất đều bị Muse từ chối nhận lệnh (không phải vì hết lượt) → tài khoản có vấn đề; các cảnh đó cần làm lại.
    const done = tasks
      .filter((x) => (x.status === "failed" || x.status === "succeeded") && x.finishedAt > nowMs - t.refusalWindowMs)
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, 3);
    const refused = done.length === 3 && done.every((x) => x.status === "failed" && /^Muse không nhận lệnh/.test(x.error) && !LIMIT_RE.test(x.error));
    if (!refused && !tasks.some((x) => x.status === "queued" || x.status === "processing")) {
      fo.loggedOutSince = fo.chromeClosedSince = 0;
      return null;
    }
    // Chỉ hết lượt → chờ như thường.
    if (st.limitHit || /^Hết hạn mức tuần/.test(st.paused)) {
      fo.loggedOutSince = 0;
      return null;
    }
    const iso = new Date(nowMs).toISOString();
    // Chrome của Muse bị đóng / tắt bất thường → mở lại, vẫn tài khoản đó.
    if (st.chromeClosed) {
      fo.chromeClosedSince ||= nowMs;
      if (nowMs - fo.chromeClosedSince < t.reopenAfterMs) return null;
      fo.chromeClosedSince = 0;
      void e.worker.login().catch(() => false);
      return await logEvent(e.dir, data, { at: iso, kind: "reopen", reason: "Cửa sổ Chrome của Muse bị đóng — đã tự mở lại (vẫn tài khoản đang dùng)." });
    }
    fo.chromeClosedSince = 0;

    let reason: string | null = null;
    if (st.loggedIn === false) {
      fo.loggedOutSince ||= nowMs;
      if (nowMs - fo.loggedOutSince >= t.logoutGraceMs) {
        await e.worker.check();
        if (e.worker.state.loggedIn === false) reason = "Muse báo chưa đăng nhập / phiên hết hạn — tài khoản có thể bị khoá hoặc bị đăng xuất.";
        else fo.loggedOutSince = 0;
      }
    } else fo.loggedOutSince = 0;
    if (!reason && refused) reason = `Muse từ chối nhận lệnh 3 lần liên tiếp: “${done[0].error.replace(/^Muse không nhận lệnh[.:]?\s*/, "").slice(0, 140)}”.`;
    if (!reason || nowMs - fo.lastSwitch < t.minGapMs) return null;

    const cur = data.accounts.find((a) => a.id === data.active) ?? data.accounts[0];
    const next = data.accounts.find((a) => a.id !== cur.id && a.backup && !a.broken);
    if (!next) {
      if (nowMs - fo.noneLeftAt < 6 * 3600e3) return null; // không báo lặp
      fo.noneLeftAt = nowMs;
      return await logEvent(e.dir, data, { at: iso, kind: "none-left", from: cur.name, reason: `${reason} Không còn tài khoản dự phòng nào dùng được — app dừng chờ bạn.` });
    }
    cur.broken = { at: iso, reason };
    const ev = await logEvent(e.dir, data, { at: iso, kind: "switch", from: cur.name, to: next.name, reason });
    fo.lastSwitch = nowMs;
    fo.loggedOutSince = 0;
    await switchMuseAccount({ to: next.id }, true);
    // Các cảnh bị từ chối vì tài khoản lỗi → gửi lại bằng tài khoản mới (không tính là lần thử hỏng).
    if (refused) {
      const fresh = museEngine();
      for (const x of done) fresh.store.update(x.id, { status: "queued", sessionId: "", step: "", error: "", pollErrors: 0, finishedAt: 0, attempts: Math.max(0, x.attempts - 1) });
      fresh.worker.pump();
    }
    return ev;
  } finally {
    fo.busy = false;
  }
}

/** Xoá bộ đếm trong tiến trình (dùng cho test). */
export function resetFailoverState(): void {
  Object.assign(fo, { loggedOutSince: 0, chromeClosedSince: 0, lastSwitch: 0, noneLeftAt: 0, busy: false });
}
