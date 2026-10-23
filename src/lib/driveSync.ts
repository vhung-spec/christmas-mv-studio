// ĐỒNG BỘ KHO NHẠC TỪ GOOGLE DRIVE — thư mục chia sẻ "Ai có đường liên kết", không cần đăng nhập Google.
// Kho chung của các kênh: thư mục gốc gồm tệp "Kho bài hát.xlsx" (mức hay, tên bài — mẫu Bokin Playlist; hoặc Google Sheet tên
// "Kho bài hát"), các thư mục bài đánh số (mỗi thư mục một Google Doc: địa điểm, chủ đề, dàn ý, lời) và một thư mục file nhạc đặt
// tên theo số ("12.wav", "12 (1).wav", "76_1.mp3").
// Một lần đồng bộ: tải Kho bài hát.xlsx (không ghi đè nếu bản ở máy đã được sửa), cập nhật thư viện lời (song_library.json), tải mọi
// file nhạc còn thiếu về Thư mục nhạc (bài cũ được dùng lại cho các video sau nên cần đủ file), file nào trên Drive đổi tên thì đổi tên
// bản ở máy cho khớp. Không xoá file nào. Chỉ dùng phía server.

import { createWriteStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UserError } from "./errors";
import { AUDIO_EXT } from "./media";
import { parseSongDoc, readSongLibrary, writeSongLibrary, type LibrarySong } from "./songLibrary";
import { SHEET_TAB, isSheetName } from "./songSheet";
import { listSongs, songNumber } from "./songs";
import { DRIVE_SYNC_FILE, readJson, readSettings, writeJson } from "./store";

/** Tự đồng bộ: cách nhau ít nhất chừng này. */
export const AUTO_SYNC_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 3;

export interface DriveEntry {
  /** sheet = Google Sheet (tải bản .xlsx). */
  kind: "folder" | "file" | "doc" | "sheet";
  id: string;
  name: string;
}

export interface DriveSyncResult {
  at: string;
  /** Bài đọc được lời (thư mục bài đánh số). */
  songs: number;
  /** File nhạc trên Drive. */
  audio: number;
  downloaded: number;
  bytes: number;
  renamed: number;
  failed: string[];
  /** Kho bài hát.xlsx lần này: đã tải / không đổi / giữ bản ở máy / Drive chưa có. */
  sheet: string | null;
  /** Cỡ + giờ sửa của Kho bài hát ở máy ngay sau lần tải gần nhất (để biết bạn đã sửa bản ở máy chưa). */
  sheetStat?: { file: string; size: number; mtimeMs: number } | null;
}

export interface DriveSyncStatus {
  running: boolean;
  /** Đang làm gì, vd. "Đọc lời bài 12/107", "Tải nhạc 30/176". */
  phase: string;
  error: string | null;
  last: DriveSyncResult | null;
}

// Trạng thái trong tiến trình (một lần đồng bộ mỗi lúc).
const g = globalThis as unknown as { __mvDriveSync?: { running: Promise<unknown> | null; phase: string; error: string | null } };
const mem = (g.__mvDriveSync ??= { running: null, phase: "", error: null });

/** Mã thư mục từ link Drive ("…/folders/ID?usp=sharing", "…?id=ID") hoặc chính mã. */
export function driveFolderId(link: string): string | null {
  const s = link.trim();
  const m = s.match(/\/folders\/([\w-]{10,})/) ?? s.match(/[?&]id=([\w-]{10,})/);
  if (m) return m[1];
  return /^[\w-]{20,}$/.test(s) ? s : null;
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/** Các mục trong trang xem thư mục công khai của Drive (embeddedfolderview). */
export function parseFolderHtml(html: string): DriveEntry[] {
  const out: DriveEntry[] = [];
  for (const m of html.matchAll(/<a href="([^"]+)"[^>]*>[\s\S]*?class="flip-entry-title">([^<]*)</g)) {
    const href = decode(m[1]);
    const name = decode(m[2]);
    const folder = href.match(/\/drive\/folders\/([\w-]+)/);
    const doc = href.match(/docs\.google\.com\/document\/d\/([\w-]+)/);
    const sheet = href.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
    const file = href.match(/\/file\/d\/([\w-]+)/);
    if (folder) out.push({ kind: "folder", id: folder[1], name });
    else if (doc) out.push({ kind: "doc", id: doc[1], name });
    else if (sheet) out.push({ kind: "sheet", id: sheet[1], name });
    else if (file) out.push({ kind: "file", id: file[1], name });
  }
  return out;
}

async function listFolder(id: string): Promise<DriveEntry[]> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`);
  const html = res.ok ? await res.text() : "";
  if (!html.includes("flip-")) {
    throw new UserError("Không đọc được thư mục Google Drive — kiểm tra link và quyền chia sẻ “Bất kỳ ai có đường liên kết”.");
  }
  return parseFolderHtml(html);
}

async function docText(id: string): Promise<string> {
  const res = await fetch(`https://docs.google.com/document/d/${encodeURIComponent(id)}/export?format=txt`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const isAudio = (name: string) => AUDIO_EXT.includes(path.extname(name).toLowerCase());
/** Khoá so khớp một bản nhạc giữa Drive và máy: số bài + số bản + đuôi (bỏ qua chữ "đã dùng"). */
const audioKey = (name: string) => {
  const num = songNumber(name);
  return num ? `${num.n}|${num.version}|${path.extname(name).toLowerCase()}` : null;
};

export interface AudioPlan {
  download: DriveEntry[];
  rename: { from: string; to: string }[];
}

/**
 * Việc cần làm với file nhạc: file trên Drive mà máy chưa có → tải (kể cả bản ghi "đã dùng": app tự xếp bài theo lịch sử kênh, bài
 * cũ được dùng lại); máy có bản cùng số + cùng bản nhưng khác tên (vd. Drive vừa đổi tên) → đổi tên cho khớp.
 */
export function planAudio(drive: DriveEntry[], local: string[]): AudioPlan {
  const byKey = new Map<string, string>();
  for (const f of local) {
    const k = audioKey(f);
    if (k && !byKey.has(k)) byKey.set(k, f);
  }
  const have = new Set(local);
  const plan: AudioPlan = { download: [], rename: [] };
  for (const e of drive) {
    if (have.has(e.name)) continue;
    const k = audioKey(e.name);
    const mine = k ? byKey.get(k) : undefined;
    if (mine) plan.rename.push({ from: mine, to: e.name });
    else plan.download.push(e);
  }
  return plan;
}

/** Tải một tệp nhỏ (Kho bài hát) về `dest.part`; trả về nội dung. Google Sheet → bản .xlsx. */
async function fetchSmall(e: DriveEntry): Promise<Buffer> {
  const url =
    e.kind === "sheet"
      ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(e.id)}/export?format=xlsx`
      : `https://drive.usercontent.google.com/download?id=${encodeURIComponent(e.id)}&export=download&confirm=t`;
  const res = await fetch(url);
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || /text\/html/.test(type)) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Kho bài hát.xlsx (hoặc .csv / Google Sheet "Kho bài hát") ở thư mục gốc trên Drive → Thư mục nhạc. Bản ở máy đã bị sửa (hoặc chép tay,
 * khác lần tải trước) thì không ghi đè. Trả về lời nhắn + cỡ / giờ sửa sau khi tải.
 */
async function syncSheet(root: DriveEntry[], dir: string, prev: DriveSyncResult["sheetStat"]): Promise<{ note: string | null; stat: DriveSyncResult["sheetStat"] }> {
  const entry = root.find((e) => e.kind === "sheet" && isSheetName(e.name, true)) ?? root.find((e) => e.kind === "file" && isSheetName(e.name));
  if (!entry) return { note: `Drive chưa có ${SHEET_TAB}.xlsx (mức hay của các bài) — mọi bài coi là mức 1.`, stat: prev ?? null };
  const ext = entry.kind === "sheet" ? ".xlsx" : path.extname(entry.name).toLowerCase();
  const name = `${SHEET_TAB}${ext}`;
  const dest = path.join(/*turbopackIgnore: true*/ dir, name);
  const buf = await retry(() => fetchSmall(entry));
  const before = existsSync(/*turbopackIgnore: true*/ dest) ? await fs.stat(/*turbopackIgnore: true*/ dest) : null;
  if (before) {
    if (Buffer.compare(await fs.readFile(/*turbopackIgnore: true*/ dest), buf) === 0) return { note: `${name}: không đổi.`, stat: prev ?? { file: name, size: before.size, mtimeMs: before.mtimeMs } };
    const ours = prev && prev.file === name && prev.size === before.size && Math.abs(prev.mtimeMs - before.mtimeMs) < 2;
    if (!ours) {
      return {
        note: `${name} ở máy đã được sửa (hoặc chép tay) — không ghi đè. Sửa trên Drive rồi chuyển bản ở máy vào Thùng rác để lần sau tải bản mới.`,
        stat: prev ?? null,
      };
    }
  }
  const part = `${dest}.part`;
  await fs.writeFile(/*turbopackIgnore: true*/ part, buf);
  await fs.rename(/*turbopackIgnore: true*/ part, dest);
  const after = await fs.stat(/*turbopackIgnore: true*/ dest);
  return { note: `${name}: đã tải bản mới.`, stat: { file: name, size: after.size, mtimeMs: after.mtimeMs } };
}

async function download(e: DriveEntry, dir: string): Promise<number> {
  const dest = path.join(/*turbopackIgnore: true*/ dir, e.name);
  const part = `${dest}.part`;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(e.id)}&export=download&confirm=t`);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !res.body || /text\/html/.test(type)) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream), createWriteStream(part));
      const { size } = await fs.stat(part);
      if (size < 100_000) throw new Error(`file quá nhỏ (${size} byte)`);
      await fs.rename(part, dest);
      return size;
    } catch (err) {
      lastErr = err as Error;
      await fs.rm(part, { force: true });
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr ?? new Error("không tải được");
}

/** Thử lại vài lần khi mạng / Google lỗi thoáng qua. */
async function retry<T>(fn: () => Promise<T>, times = 3): Promise<T> {
  for (let k = 1; ; k++) {
    try {
      return await fn();
    } catch (err) {
      if (k >= times) throw err;
      await new Promise((r) => setTimeout(r, 1500 * k));
    }
  }
}

/** Chạy fn cho từng phần tử, mỗi lúc `n` việc. */
async function pool<T>(items: T[], n: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

async function runSync(): Promise<DriveSyncResult> {
  const settings = await readSettings();
  const rootId = driveFolderId(settings.driveFolder);
  if (!rootId) throw new UserError("Chưa có link thư mục kho nhạc trên Google Drive (hoặc link không đúng).");
  const dir = settings.songDir.trim();
  if (!dir) throw new UserError("Chưa đặt “Thư mục nhạc” — app cần biết lưu file nhạc vào đâu.");
  await fs.mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });

  mem.phase = "Đọc thư mục Drive…";
  const root = await retry(() => listFolder(rootId));
  const songFolders = root.filter((e) => e.kind === "folder" && /^\d{1,4}(?!\d)/.test(e.name));
  const otherFolders = root.filter((e) => e.kind === "folder" && !/^\d{1,4}(?!\d)/.test(e.name));
  const audio = root.filter((e) => e.kind === "file" && isAudio(e.name) && songNumber(e.name));
  for (const f of otherFolders) {
    const inside = await retry(() => listFolder(f.id)).catch(() => []);
    audio.push(...inside.filter((e) => e.kind === "file" && isAudio(e.name) && songNumber(e.name)));
  }
  const failed: string[] = [];

  // 0. Kho bài hát.xlsx (mức hay, tên bài).
  mem.phase = "Tải Kho bài hát…";
  const prev = (await readJson<DriveSyncResult | null>(DRIVE_SYNC_FILE(), null))?.sheetStat ?? null;
  const sheet = await syncSheet(root, dir, prev).catch((err) => {
    failed.push(`${SHEET_TAB}.xlsx (${(err as Error).message})`);
    return { note: null, stat: prev };
  });

  // 1. Lời bài hát
  const songs: LibrarySong[] = [];
  let read = 0;
  await pool(songFolders, CONCURRENCY + 1, async (f) => {
    const n = Number(f.name.match(/^\d+/)![0]);
    try {
      const doc = (await retry(() => listFolder(f.id))).find((e) => e.kind === "doc");
      const song = doc ? parseSongDoc(n, await retry(() => docText(doc.id))) : null;
      if (song) songs.push(song);
    } catch {
      failed.push(`lời bài ${n}`);
    }
    mem.phase = `Đọc lời bài hát ${++read}/${songFolders.length}`;
  });
  if (songs.length) {
    const lib = await readSongLibrary();
    const fresh = new Map(songs.map((s) => [s.n, s]));
    await writeSongLibrary({
      updated_at: new Date().toISOString(),
      source: settings.driveFolder.trim(),
      songs: [...lib.songs.filter((s) => !fresh.has(s.n)), ...fresh.values()],
    });
  }

  // 2. File nhạc
  const local = (await listSongs(dir, 1).catch(() => [])).map((f) => path.basename(f));
  const plan = planAudio(audio, local);
  let renamed = 0;
  for (const r of plan.rename) {
    const to = path.join(/*turbopackIgnore: true*/ dir, r.to);
    if (existsSync(to)) continue;
    await fs.rename(path.join(/*turbopackIgnore: true*/ dir, r.from), to).then(() => renamed++, () => failed.push(`đổi tên ${r.from}`));
  }
  let downloaded = 0;
  let tried = 0;
  let bytes = 0;
  mem.phase = plan.download.length ? `Tải nhạc 0/${plan.download.length}` : "Không có bản nhạc mới";
  await pool(plan.download, CONCURRENCY, async (e) => {
    try {
      bytes += await download(e, dir);
      downloaded++;
    } catch {
      failed.push(e.name);
    }
    mem.phase = `Tải nhạc ${++tried}/${plan.download.length}`;
  });

  return {
    at: new Date().toISOString(),
    songs: songs.length,
    audio: audio.length,
    downloaded,
    bytes,
    renamed,
    failed,
    sheet: sheet.note,
    sheetStat: sheet.stat,
  };
}

/** Bắt đầu đồng bộ (chạy nền). false nếu đang đồng bộ. Xong thì gọi onDone (vd. đánh thức dây chuyền). */
export function startDriveSync(onDone?: () => void): boolean {
  if (mem.running) return false;
  mem.error = null;
  mem.phase = "Bắt đầu…";
  mem.running = runSync()
    .then(async (r) => {
      await writeJson(DRIVE_SYNC_FILE(), r);
    })
    .catch((err) => {
      mem.error = (err as Error).message;
      console.error("[drive]", mem.error);
    })
    .finally(() => {
      mem.running = null;
      mem.phase = "";
      onDone?.();
    });
  return true;
}

export async function driveSyncStatus(): Promise<DriveSyncStatus> {
  return { running: Boolean(mem.running), phase: mem.phase, error: mem.error, last: await readJson<DriveSyncResult | null>(DRIVE_SYNC_FILE(), null) };
}

/** Đến hạn tự đồng bộ chưa (có link, bật tự đồng bộ, lần trước đã quá AUTO_SYNC_MS). */
export async function autoSyncDue(): Promise<boolean> {
  const s = await readSettings();
  if (!s.driveAutoSync || !driveFolderId(s.driveFolder) || !s.songDir.trim() || mem.running) return false;
  const last = await readJson<DriveSyncResult | null>(DRIVE_SYNC_FILE(), null);
  return !last || Date.now() - Date.parse(last.at) >= AUTO_SYNC_MS;
}

/** Chờ lần đồng bộ đang chạy xong (dùng cho test). */
export async function driveSyncIdle(): Promise<void> {
  while (mem.running) await mem.running;
}
