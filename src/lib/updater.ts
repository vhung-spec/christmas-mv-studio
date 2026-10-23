// TỰ CẬP NHẬT — phần chạy trong app: hỏi GitHub (repo riêng tư; token chỉ-đọc trong .env.local) xem nhánh có bản mới không, tải về,
// giải nén vào thư mục "<thư mục app>-cap-nhat" cạnh thư mục app và kiểm tra; khi app rảnh (không dựng video, không viết kịch bản,
// không gửi cảnh Muse, không đồng bộ Drive…) thì xin trình khởi động cài: app tự tắt với mã 75, scripts/start.mjs chép bản mới
// (scripts/cap-nhat.mjs), build, chạy lại; build lỗi / app không chạy thì quay về bản cũ. Cũng nhận gói .zip bạn tải lên (dự phòng).
// Bản mã nguồn có .git (máy phát triển) không tự cập nhật. Chỉ dùng phía server.

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { setEnvLine } from "./apikey";
import { batchEngine } from "./batchEngine";
import { driveSyncStatus } from "./driveSync";
import { UserError } from "./errors";
import { isSuggesting } from "./ideaBank";
import { closeMuseEngine, museEngineIfStarted } from "./museEngine";
import { scriptRunning } from "./pipeline";
import { readQueue } from "./queue";
import { anyRendering } from "./render";
import { readJson, readSettings, withLock, writeJson } from "./store";

export const APP_ID = "christmas-mv-studio";
/** Khớp scripts/cap-nhat.mjs: mã app tự tắt để xin cài, tên các file trong thư mục cập nhật. */
export const RESTART_CODE = 75;
const PENDING = "cho-cai.json";
const RESULT = "ket-qua.json";
const VERSION_FILE = "ban-cai.json";
const STATE = "trang-thai.json";
const TOKEN_ENV = "GITHUB_UPDATE_TOKEN";
/** Tự kiểm tra bản mới mỗi chừng này. */
const CHECK_MS = 60 * 60e3;
const MAX_ZIP = 200 * 1024 * 1024;

/** Thư mục app (MVS_APP_ROOT chỉ dùng cho test). */
const root = () => path.resolve(/*turbopackIgnore: true*/ process.env.MVS_APP_ROOT || process.cwd());
/** Địa chỉ API GitHub (MVS_GITHUB_API chỉ dùng cho test: máy chủ giả). */
const githubApi = () => process.env.MVS_GITHUB_API || "https://api.github.com";
/** Thư mục cập nhật cạnh thư mục app, vd. C:\Christmas-MV-Studio\Christmas-MV-Studio-cap-nhat (khớp scripts/cap-nhat.mjs). */
export const updateDir = () => path.join(/*turbopackIgnore: true*/ path.dirname(root()), `${path.basename(root())}-cap-nhat`);
const inDir = (name: string) => path.join(/*turbopackIgnore: true*/ updateDir(), name);
const token = () => process.env[TOKEN_ENV]?.trim() ?? "";
/** Máy phát triển (thư mục app là kho git): không tự cập nhật, không ghi đè mã đang sửa. */
export const isGitCheckout = () => existsSync(path.join(/*turbopackIgnore: true*/ root(), ".git"));

function readJsonSync<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as T;
  } catch {
    return null;
  }
}

// ---------- Bản đang chạy ----------

export interface AppVersion {
  commit: string;
  date: string;
  /** "github" · "goi" (gói tải lên / gói cài) · "git" (máy phát triển) · "" (chưa rõ — cài từ gói cũ). */
  source: string;
  branch: string;
}

/** Bản đang chạy: ban-cai.json (do gói cài / lần cập nhật ghi), hoặc commit hiện tại của kho git. */
export function currentVersion(): AppVersion {
  if (isGitCheckout()) {
    const git = path.join(/*turbopackIgnore: true*/ root(), ".git");
    try {
      const head = readFileSync(/*turbopackIgnore: true*/ path.join(git, "HEAD"), "utf8").trim();
      const ref = head.match(/^ref: (.+)$/)?.[1];
      let sha = ref ? "" : head;
      if (ref) {
        const loose = path.join(/*turbopackIgnore: true*/ git, ref);
        sha = existsSync(loose) ? readFileSync(/*turbopackIgnore: true*/ loose, "utf8").trim() : (readFileSync(/*turbopackIgnore: true*/ path.join(git, "packed-refs"), "utf8").match(new RegExp(`^([0-9a-f]{40}) ${ref}$`, "m"))?.[1] ?? "");
      }
      return { commit: sha, date: "", source: "git", branch: ref?.replace(/^refs\/heads\//, "") ?? "" };
    } catch {
      return { commit: "", date: "", source: "git", branch: "" };
    }
  }
  const v = readJsonSync<Partial<AppVersion>>(path.join(/*turbopackIgnore: true*/ root(), VERSION_FILE));
  return { commit: v?.commit ?? "", date: v?.date ?? "", source: v?.source ?? "", branch: v?.branch ?? "" };
}

// ---------- Trạng thái ----------

interface Ready {
  sha: string;
  date: string;
  message: string;
  /** Thư mục mã nguồn bản mới (đã giải nén, đã kiểm tra). */
  dir: string;
  source: "github" | "goi";
  branch: string;
  at: string;
}

interface UpdateState {
  lastCheck: { at: string; ok: boolean; upToDate?: boolean; error?: string } | null;
  latest: { sha: string; date: string; message: string; changes: string[]; newer: boolean } | null;
  ready: Ready | null;
  /** Bạn đã bấm "Cài ngay" / tải gói lên: cài khi app rảnh, kể cả khi không bật tự cập nhật. */
  wanted: boolean;
  /** Bản đã cài lỗi (trình khởi động quay về bản cũ) — không tự cài lại bản đó. */
  bad: string[];
  /** Đã đọc kết quả cài này (ket-qua.json, theo thời điểm). */
  seenResult: string;
}

const EMPTY: UpdateState = { lastCheck: null, latest: null, ready: null, wanted: false, bad: [], seenResult: "" };
const readState = async (): Promise<UpdateState> => ({ ...EMPTY, ...(await readJson<Partial<UpdateState>>(inDir(STATE), {})) });
function updateState<T>(fn: (s: UpdateState) => T): Promise<T> {
  return withLock("update", async () => {
    const s = await readState();
    const out = fn(s);
    await writeJson(inDir(STATE), s);
    return out;
  });
}

const g = globalThis as unknown as { __mvUpdate?: { busy: "checking" | "downloading" | "installing" | null; error: string | null } };
const mem = (g.__mvUpdate ??= { busy: null, error: null });

export interface InstallResult {
  at: string;
  ok: boolean;
  sha: string;
  from?: string;
  error?: string;
  rolledBack?: boolean;
}

/** Kết quả lần cài gần nhất (trình khởi động ghi): cài xong → bỏ bản đã tải; lỗi → nhớ bản lỗi để không tự cài lại. */
async function syncResult(): Promise<InstallResult | null> {
  const r = readJsonSync<InstallResult>(inDir(RESULT));
  if (!r) return null;
  const st = await readState();
  if (st.seenResult === r.at) return r;
  await updateState((s) => {
    s.seenResult = r.at;
    if (s.ready?.sha === r.sha) s.ready = null;
    if (!r.ok && r.sha && !s.bad.includes(r.sha)) s.bad.push(r.sha);
    if (r.ok) s.wanted = false;
  });
  return r;
}

// ---------- GitHub ----------

async function gh(url: string): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": APP_ID };
  if (token()) headers.Authorization = `Bearer ${token()}`;
  return fetch(`${githubApi()}${url}`, { headers, signal: AbortSignal.timeout(120e3) });
}

function ghError(res: Response, what: string): UserError {
  if (res.status === 401) return new UserError("Token GitHub sai hoặc đã hết hạn — tạo token mới rồi dán lại.", 401);
  if (res.status === 403 || res.status === 429) return new UserError(`GitHub từ chối (${what}): token không có quyền đọc repo, hoặc hỏi quá nhiều lần — thử lại sau.`, 403);
  if (res.status === 404) return new UserError(`Không thấy ${what} trên GitHub — kiểm tra tên repo / nhánh${token() ? " và quyền của token" : "; repo riêng tư cần token"}.`, 404);
  return new UserError(`GitHub lỗi ${res.status} (${what}).`, 502);
}

const firstLine = (s: string) => s.split("\n")[0].trim();

/** Hỏi GitHub bản mới nhất của nhánh; mới hơn bản đang chạy thì tải về (lỗi ghi vào trạng thái, không ném ra). */
export async function checkUpdate(manual = false): Promise<void> {
  if (isGitCheckout() || mem.busy) return;
  const s = await readSettings();
  mem.busy = "checking";
  mem.error = null;
  try {
    if (!s.updateRepo || !s.updateBranch) throw new UserError("Chưa đặt repo / nhánh để lấy bản cập nhật.");
    const res = await gh(`/repos/${s.updateRepo}/commits/${encodeURIComponent(s.updateBranch)}`);
    if (!res.ok) throw ghError(res, `repo ${s.updateRepo}, nhánh ${s.updateBranch}`);
    const c = (await res.json()) as { sha: string; commit: { message: string; committer: { date: string } } };
    const cur = currentVersion();
    let newer = c.sha !== cur.commit;
    let changes: string[] = [];
    if (newer && cur.commit) {
      // Có lịch sử chung → so trên GitHub (bản đang chạy mới hơn nhánh thì thôi); không có → so ngày.
      const cmp = await gh(`/repos/${s.updateRepo}/compare/${cur.commit}...${c.sha}`);
      if (cmp.ok) {
        const j = (await cmp.json()) as { status: string; commits: { commit: { message: string } }[] };
        newer = j.status === "ahead" || j.status === "diverged";
        changes = j.commits.map((x) => firstLine(x.commit.message)).reverse().slice(0, 30);
      } else if (cur.date) {
        newer = Date.parse(c.commit.committer.date) > Date.parse(cur.date);
      }
    }
    if (newer && !changes.length) changes = [firstLine(c.commit.message)];
    const st = await updateState((x) => {
      x.lastCheck = { at: new Date().toISOString(), ok: true, upToDate: !newer };
      x.latest = { sha: c.sha, date: c.commit.committer.date, message: firstLine(c.commit.message), changes, newer };
      return { ready: x.ready, bad: x.bad };
    });
    if (newer && st.ready?.sha !== c.sha && (manual || !st.bad.includes(c.sha))) {
      mem.busy = "downloading";
      await downloadGithub(s.updateRepo, s.updateBranch, c.sha, c.commit.committer.date, firstLine(c.commit.message));
    }
  } catch (e) {
    mem.error = (e as Error).message;
    await updateState((x) => {
      x.lastCheck = { at: new Date().toISOString(), ok: false, error: mem.error ?? "" };
    });
  } finally {
    mem.busy = null;
  }
}

async function saveStream(res: Response, to: string) {
  if (Number(res.headers.get("content-length") || 0) > MAX_ZIP) throw new UserError("Gói cập nhật quá lớn.");
  let size = 0;
  const src = Readable.fromWeb(res.body as WebReadableStream<Uint8Array>);
  src.on("data", (c: Buffer) => {
    size += c.length;
    if (size > MAX_ZIP) src.destroy(new UserError("Gói cập nhật quá lớn."));
  });
  await pipeline(src, createWriteStream(/*turbopackIgnore: true*/ to));
}

async function downloadGithub(repo: string, branch: string, sha: string, date: string, message: string) {
  const res = await gh(`/repos/${repo}/zipball/${sha}`);
  if (!res.ok || !res.body) throw ghError(res, "gói mã nguồn");
  const dir = inDir(`moi-${sha.slice(0, 12)}`);
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const zip = path.join(/*turbopackIgnore: true*/ dir, "goi.zip");
  await saveStream(res, zip);
  const top = await stageZip(zip, dir);
  await updateState((x) => {
    x.ready = { sha, date, message, dir: top, source: "github", branch, at: new Date().toISOString() };
  });
}

// ---------- Giải nén + kiểm tra ----------

/** Giải nén .zip bằng tar có sẵn (Windows 10/11: tar.exe; macOS: bsdtar) — tar không ghi ra ngoài thư mục đích. */
function extract(zip: string, dest: string): Promise<void> {
  const tar = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  return new Promise((resolve, reject) => {
    const p = spawn(tar, ["-xf", zip, "-C", dest], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new UserError(`Không giải nén được gói: ${err.trim() || `tar mã ${code}`}`))));
  });
}

/** Giải nén vào `dir/giai-nen-…`, tìm thư mục gốc của app trong gói và kiểm tra đúng là Christmas MV Studio. */
async function stageZip(zip: string, dir: string): Promise<string> {
  const out = path.join(/*turbopackIgnore: true*/ dir, `giai-nen-${Date.now().toString(36)}`);
  await fs.mkdir(/*turbopackIgnore: true*/ out, { recursive: true });
  await extract(zip, out);
  const entries = await fs.readdir(/*turbopackIgnore: true*/ out, { withFileTypes: true });
  const top = entries.length === 1 && entries[0].isDirectory() ? path.join(/*turbopackIgnore: true*/ out, entries[0].name) : out;
  const pkg = readJsonSync<{ name?: string }>(path.join(/*turbopackIgnore: true*/ top, "package.json"));
  if (pkg?.name !== APP_ID) throw new UserError("Gói không phải Christmas MV Studio (package.json khác).");
  for (const need of ["scripts/start.mjs", "scripts/cap-nhat.mjs", "src/app/layout.tsx", "package-lock.json"]) {
    if (!existsSync(path.join(/*turbopackIgnore: true*/ top, need))) throw new UserError(`Gói thiếu ${need}.`);
  }
  return top;
}

/** Gói .zip bạn tải lên (Dong-goi-cap-nhat.bat, hoặc tải từ GitHub) → chuẩn bị cài; tải lên = muốn cài → cài khi app rảnh. */
export async function stageUpload(data: Buffer, name: string): Promise<void> {
  if (isGitCheckout()) throw new UserError("Đây là bản mã nguồn (có .git): cập nhật bằng git.");
  if (data.length > MAX_ZIP) throw new UserError("Gói quá lớn.");
  if (data.subarray(0, 2).toString("latin1") !== "PK") throw new UserError("File không phải gói .zip.");
  const id = `goi-${Date.now().toString(36)}`;
  const dir = inDir(`moi-${id}`);
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  const zip = path.join(/*turbopackIgnore: true*/ dir, "goi.zip");
  await fs.writeFile(/*turbopackIgnore: true*/ zip, data);
  const top = await stageZip(zip, dir);
  // Gói đóng bằng Dong-goi có ban-cai.json (mã commit); gói GitHub là thư mục "chủ-repo-<mã ngắn>".
  const v = readJsonSync<Partial<AppVersion>>(path.join(/*turbopackIgnore: true*/ top, VERSION_FILE));
  const sha = v?.commit || path.basename(top).match(/-([0-9a-f]{7,40})$/)?.[1] || id;
  await updateState((x) => {
    x.ready = { sha, date: v?.date ?? "", message: `Gói tải lên: ${name.slice(0, 120)}`, dir: top, source: "goi", branch: v?.branch ?? "", at: new Date().toISOString() };
    x.wanted = true;
    x.bad = x.bad.filter((b) => b !== sha);
  });
}

// ---------- Cài ----------

/** Việc đang làm khiến chưa cài được (cài = app tắt vài phút); null = rảnh. */
export async function busyReason(): Promise<string | null> {
  if (anyRendering()) return "đang dựng video";
  const q = await readQueue();
  if (q.items.some((i) => i.status === "running") || (q.running && q.items.some((i) => i.status === "waiting"))) return "còn video trong hàng chờ dựng";
  if (scriptRunning()) return "Claude đang viết kịch bản";
  if (batchEngine.running) return "đang chạy batch";
  if (isSuggesting()) return "Claude đang đề xuất ý tưởng";
  if ((await driveSyncStatus()).running) return "đang đồng bộ kho nhạc";
  const muse = museEngineIfStarted();
  if (muse?.worker.state.current) return "đang gửi cảnh cho Muse";
  if (muse?.worker.state.loggingIn) return "đang chờ đăng nhập Muse";
  return null;
}

/**
 * Có bản mới đã tải + app rảnh → ghi "chờ cài" cho trình khởi động rồi tự tắt (mã 75): trình khởi động cài, build, chạy lại.
 * App không chạy bằng trình khởi động (vd. npm start) thì không tự tắt được.
 */
export async function installWhenIdle(): Promise<{ started: boolean; reason?: string }> {
  const st = await readState();
  if (!st.ready) return { started: false, reason: "chưa có bản mới đã tải về" };
  if (!existsSync(st.ready.dir)) {
    await updateState((x) => {
      x.ready = null;
    });
    return { started: false, reason: "bản đã tải về không còn — kiểm tra lại" };
  }
  const busy = await busyReason();
  if (busy) return { started: false, reason: busy };
  if (process.env.MVS_SUPERVISOR !== "2") return { started: false, reason: "app không chạy bằng Chay-Christmas-MV-Studio.bat — tắt app rồi mở lại bằng file đó để cài" };
  if (mem.busy === "installing") return { started: true };
  mem.busy = "installing";
  const { sha, date, message, dir, branch, source } = st.ready;
  await writeJson(inDir(PENDING), { sha, date, message, dir, branch, source, at: new Date().toISOString() });
  console.log(`[cập nhật] Tắt app để cài bản mới ${sha.slice(0, 7)}…`);
  await closeMuseEngine().catch(() => {});
  // Trả lời trang trước rồi mới tắt.
  setTimeout(() => process.exit(RESTART_CODE), 500).unref?.();
  return { started: true };
}

/** Bạn bấm "Cài ngay": cài khi app rảnh (kể cả khi không bật tự cập nhật). */
export async function wantInstall(): Promise<{ started: boolean; reason?: string }> {
  await updateState((x) => {
    x.wanted = true;
  });
  return installWhenIdle();
}

/** Gọi định kỳ (autostart): tới hạn thì kiểm tra bản mới; có bản đã tải + (tự cập nhật hoặc bạn đã bấm cài) → cài khi rảnh. */
export async function updateTick(): Promise<void> {
  if (isGitCheckout()) return;
  await syncResult();
  const s = await readSettings();
  const st = await readState();
  if (s.autoUpdate && (!st.lastCheck || Date.now() - Date.parse(st.lastCheck.at) > CHECK_MS)) await checkUpdate(false);
  const now = await readState();
  if (now.ready && (s.autoUpdate || now.wanted)) await installWhenIdle();
}

/** Đặt / xoá token GitHub (chỉ đọc) — lưu trong .env.local của máy này, không bao giờ gửi lại cho trang. */
export async function setUpdateToken(value: string | null): Promise<void> {
  if (value !== null && !/^[A-Za-z0-9_]{20,255}$/.test(value.trim())) throw new UserError("Token GitHub không hợp lệ (thường bắt đầu bằng github_pat_ hoặc ghp_).");
  await setEnvLine(TOKEN_ENV, value === null ? null : value.trim());
}

/** Tình trạng cho thẻ "Cập nhật app" (không bao giờ có token). */
export async function updateStatus() {
  const lastResult = await syncResult();
  const s = await readSettings();
  const st = await readState();
  const git = isGitCheckout();
  return {
    enabled: !git,
    current: currentVersion(),
    repo: s.updateRepo,
    branch: s.updateBranch,
    autoUpdate: s.autoUpdate,
    hasToken: Boolean(token()),
    /** Chạy bằng trình khởi động (tự tắt để cài được). */
    supervisor: process.env.MVS_SUPERVISOR === "2",
    busy: mem.busy,
    error: mem.error,
    lastCheck: st.lastCheck,
    latest: st.latest,
    ready: st.ready ? { sha: st.ready.sha, date: st.ready.date, message: st.ready.message, source: st.ready.source, at: st.ready.at } : null,
    wanted: st.wanted,
    waitingFor: st.ready && !git ? await busyReason() : null,
    bad: st.bad,
    lastResult,
    dir: updateDir(),
    installedAt: (() => {
      try {
        return statSync(path.join(/*turbopackIgnore: true*/ root(), VERSION_FILE)).mtime.toISOString();
      } catch {
        return null;
      }
    })(),
  };
}
