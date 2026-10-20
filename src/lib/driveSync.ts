// ĐỒNG BỘ KHO NHẠC TỪ GOOGLE DRIVE — thư mục chia sẻ "Ai có đường liên kết", không cần đăng nhập Google.
// Kho của kênh: thư mục gốc (vd. "KHO NHẠC ROCK") gồm các thư mục bài đánh số (mỗi thư mục một Google Doc: địa điểm, chủ đề,
// dàn ý, lời) và một thư mục file nhạc đặt tên theo số ("12.wav", "12 (1).wav", "76_1.mp3"; thêm "đã dùng" khi đã làm MV).
// Một lần đồng bộ: cập nhật thư viện lời (song_library.json), tải các bản nhạc CHƯA DÙNG còn thiếu về Thư mục nhạc, và bản nào
// trên Drive đổi tên (vd. vừa ghi "đã dùng") thì đổi tên bản ở máy cho khớp. Không xoá file nào. Chỉ dùng phía server.

import { createWriteStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { UserError } from "./errors";
import { AUDIO_EXT } from "./media";
import { parseSongDoc, readSongLibrary, writeSongLibrary, type LibrarySong } from "./songLibrary";
import { isUsedSong, listSongs, songNumber } from "./songs";
import { DRIVE_SYNC_FILE, readJson, readSettings, writeJson } from "./store";

/** Tự đồng bộ: cách nhau ít nhất chừng này. */
export const AUTO_SYNC_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 3;

export interface DriveEntry {
  kind: "folder" | "file" | "doc";
  id: string;
  name: string;
}

export interface DriveSyncResult {
  at: string;
  /** Bài đọc được lời (thư mục bài đánh số). */
  songs: number;
  /** File nhạc trên Drive / bản chưa dùng. */
  audio: number;
  unused: number;
  downloaded: number;
  bytes: number;
  renamed: number;
  failed: string[];
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
    const file = href.match(/\/file\/d\/([\w-]+)/);
    if (folder) out.push({ kind: "folder", id: folder[1], name });
    else if (doc) out.push({ kind: "doc", id: doc[1], name });
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
 * Việc cần làm với file nhạc: bản trên Drive chưa dùng mà máy chưa có → tải; máy có bản cùng số + cùng bản nhưng khác tên
 * (vd. Drive vừa ghi "đã dùng") → đổi tên cho khớp; bản đã dùng mà máy chưa có → bỏ qua.
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
    else if (!isUsedSong(e.name)) plan.download.push(e);
  }
  return plan;
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

  // 1. Lời bài hát
  const failed: string[] = [];
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
    unused: audio.filter((e) => !isUsedSong(e.name)).length,
    downloaded,
    bytes,
    renamed,
    failed,
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
