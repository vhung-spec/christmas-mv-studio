// TỰ CẬP NHẬT — phần chạy trong trình khởi động (scripts/start.mjs), lúc app chính đã tắt:
//   · cài bản mới app đã tải về (thư mục "<thư mục app>-cap-nhat/moi-…", tải từ GitHub hoặc gói bạn tải lên): chép đè mã nguồn; file
//     của bản cũ mà bản mới không còn thì chuyển sang thư mục dự phòng (không xoá file nào); giữ nguyên dữ liệu của máy này (data/,
//     .env.local, thư viện đã cài, bản build, các file .bat);
//   · cài lỗi (build lỗi / app không chạy) → quay về bản cũ từ thư mục dự phòng.
// Chỉ dùng thư viện có sẵn của Node.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

export const APP_ID = "christmas-mv-studio";
/** Mã app tự tắt để xin cài bản mới (trình khởi động cài rồi chạy lại). */
export const RESTART_CODE = 75;
/** Thư mục cập nhật: cạnh thư mục app, vd. C:\Christmas-MV-Studio\Christmas-MV-Studio-cap-nhat. */
export const updateDir = (root) => path.join(path.dirname(root), `${path.basename(root)}-cap-nhat`);
/** App ghi: bản mới đã sẵn sàng, chờ trình khởi động cài. */
export const PENDING = "cho-cai.json";
/** Trình khởi động ghi: kết quả lần cài gần nhất (app đọc để báo trên trang). */
export const RESULT = "ket-qua.json";
/** Trong thư mục app: bản đang cài (mã commit, ngày, nguồn, danh sách file). */
export const VERSION_FILE = "ban-cai.json";
/** Giữ lại chừng này thư mục dự phòng / bản tải về gần nhất; cũ hơn chuyển vào Thùng rác. */
const KEEP_BACKUPS = 3;

/** Phần của máy này — không bao giờ chép đè / chuyển đi. File .bat ở gốc: cửa sổ đang chạy đọc dở file đó, sửa giữa chừng sẽ lỗi. */
function isKept(rel) {
  const top = rel.split("/")[0];
  if (["data", "node_modules", ".next", ".git", VERSION_FILE].includes(top) || /^\.env/.test(top)) return true;
  return !rel.includes("/") && /\.(bat|command)$/i.test(rel);
}
/** Thư mục hoàn toàn thuộc mã nguồn: file có ở bản cũ mà bản mới không có = file thừa (bản mới đã bỏ) → chuyển sang dự phòng. */
const OWNED_DIRS = ["src", "scripts", "tests", "public"];

/** Mọi file trong thư mục (đường dẫn tương đối, dấu "/"). */
export function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

export function readJsonSafe(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/**
 * Kế hoạch cài bản ở `newRoot` lên `root`: chép mọi file của bản mới (trừ phần của máy này); data/: chỉ thêm file máy này chưa có
 * (thư viện mới), không đè dữ liệu của bạn; file thừa của bản cũ trong các thư mục mã nguồn → dự phòng.
 */
export function planUpdate(root, newRoot) {
  const incoming = listFiles(newRoot);
  const copy = [];
  const addData = [];
  for (const rel of incoming) {
    if (rel.startsWith("data/")) {
      if (!existsSync(path.join(root, rel))) addData.push(rel);
    } else if (!isKept(rel)) copy.push(rel);
  }
  const want = new Set(incoming);
  const stale = OWNED_DIRS.flatMap((d) => listFiles(path.join(root, d)).map((r) => `${d}/${r}`)).filter((rel) => !want.has(rel));
  return { copy, addData, stale };
}

/**
 * Cài: ghi trước danh sách thay đổi (cap-nhat.json trong `backup`), rồi chuyển file thừa và bản cũ của các file sắp chép đè vào
 * `backup` — đủ để quay lại bằng rollbackUpdate.
 */
export function applyUpdate(root, newRoot, backup) {
  const plan = planUpdate(root, newRoot);
  const files = [...plan.copy, ...plan.addData];
  const manifest = {
    at: new Date().toISOString(),
    replaced: files.filter((rel) => existsSync(path.join(root, rel))),
    added: files.filter((rel) => !existsSync(path.join(root, rel))),
    stale: plan.stale,
  };
  mkdirSync(backup, { recursive: true });
  writeFileSync(path.join(backup, "cap-nhat.json"), JSON.stringify(manifest, null, 2));
  const saved = (rel) => {
    const to = path.join(backup, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    return to;
  };
  for (const rel of plan.stale) renameSync(path.join(root, rel), saved(rel));
  for (const rel of manifest.replaced) copyFileSync(path.join(root, rel), saved(rel));
  for (const rel of files) {
    const dest = path.join(root, rel);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(path.join(newRoot, rel), dest);
  }
  return manifest;
}

/** Quay về bản cũ: chép lại file cũ từ `backup`; file bản mới thêm vào thì chuyển sang `backup/_them-moi` (không xoá). */
export function rollbackUpdate(root, backup) {
  const m = readJsonSafe(path.join(backup, "cap-nhat.json"), null);
  if (!m) throw new Error("Không thấy danh sách thay đổi (cap-nhat.json) trong thư mục dự phòng.");
  for (const rel of m.added) {
    const p = path.join(root, rel);
    if (!existsSync(p)) continue;
    const to = path.join(backup, "_them-moi", rel);
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(p, to);
  }
  for (const rel of [...m.replaced, ...m.stale]) {
    const from = path.join(backup, rel);
    if (!existsSync(from)) continue;
    const to = path.join(root, rel);
    mkdirSync(path.dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

/** Chuyển vào Thùng rác (Windows: Thùng rác thật; máy khác hoặc khi đặt MV_TRASH_DIR (test): chuyển vào thư mục đó). */
export function toTrash(target) {
  const custom = process.env.MV_TRASH_DIR;
  if (custom || process.platform !== "win32") {
    const bin = custom ? path.resolve(custom) : path.join(path.dirname(target), "_thung-rac");
    mkdirSync(bin, { recursive: true });
    renameSync(target, path.join(bin, `${path.basename(target)}-${Date.now().toString(36)}`));
    return true;
  }
  const call = statSync(target).isDirectory() ? "DeleteDirectory" : "DeleteFile";
  const script = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${call}($env:MV_TRASH_TARGET, 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { env: { ...process.env, MV_TRASH_TARGET: target }, windowsHide: true });
  return r.status === 0 && !existsSync(target);
}

/** Giữ KEEP_BACKUPS thư mục dự phòng ("cu-…") và bản tải về ("moi-…") mới nhất; cũ hơn → Thùng rác. */
export function pruneOld(dir, keepDirs = []) {
  if (!existsSync(dir)) return;
  for (const prefix of ["cu-", "moi-"]) {
    const list = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith(prefix))
      .map((e) => ({ p: path.join(dir, e.name), t: statSync(path.join(dir, e.name)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const old of list.slice(KEEP_BACKUPS)) if (!keepDirs.includes(old.p)) toTrash(old.p);
  }
}
