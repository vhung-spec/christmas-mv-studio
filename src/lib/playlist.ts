// DANH SÁCH NHẠC CỦA VIDEO DÀI — video Giáng sinh khoảng 1 tiếng dùng nhiều bài nối nhau (Cài đặt → Độ dài video).
// Kho nhạc như kho của kênh cũ: file đặt theo số bài ("12.wav", "12 (1).wav" = bản thứ hai, "8 đã dùng.mp3"), hoặc theo tên bài.
// Mỗi video lấy lần lượt các bài CHƯA DÙNG (bỏ bản ghi "đã dùng" và bản đã ghép vào video khác — sổ bài đã dùng), mỗi bài một bản,
// số bài nhỏ trước, cho tới khi đủ độ dài; một file dài sẵn (vd. bản mix 1 tiếng) đủ độ dài thì dùng một mình nó.
// Rồi nối thành một file FLAC (không mất chất lượng) và ghi lại bài nào bắt đầu ở giây nào — để viết danh sách bài vào mô tả YouTube.

import { promises as fs } from "node:fs";
import path from "node:path";
import { ffmpegOrThrow, probe } from "./ffmpeg";
import { readSongLibrary } from "./songLibrary";
import { isUsedSong, normSong, pickSong, songNumber, type SongTaken } from "./songs";
import type { PlaylistTrack } from "./types";

/** Nhạc ít hơn chừng này phần độ dài video thì chưa ghép (chờ thêm bài). */
export const ENOUGH_RATIO = 0.9;

export interface PoolSong {
  file: string;
  duration: number;
  channels: number | null;
}

// Thời lượng các file nhạc, nhớ theo đường dẫn + cỡ + giờ sửa (đọc thư mục nhiều lần không phải đo lại).
const g = globalThis as unknown as { __xmasSongInfo?: Map<string, { duration: number; channels: number | null }> };
const cache = (g.__xmasSongInfo ??= new Map());

/** Đo thời lượng các file nhạc (file hỏng / không đọc được thì bỏ qua). */
export async function songDurations(files: string[]): Promise<PoolSong[]> {
  const out: PoolSong[] = [];
  for (const file of files) {
    const st = await fs.stat(/*turbopackIgnore: true*/ file).catch(() => null);
    if (!st) continue;
    const key = `${file}|${st.size}|${st.mtimeMs}`;
    let info = cache.get(key);
    if (!info) {
      const p = await probe(file).catch(() => null);
      if (!p?.audio) continue;
      info = { duration: p.duration, channels: p.channels ?? null };
      cache.set(key, info);
    }
    out.push({ file, ...info });
  }
  return out;
}

const extRank = (file: string) => (/\.(wav|flac|aiff?)$/i.test(file) ? 0 : 1);

/** Nhóm "cùng một bài" (mọi bản của bài số 12 là một nhóm; bài đặt theo tên thì mỗi tên một nhóm). */
function songGroup(file: string): string {
  const num = songNumber(path.basename(file));
  if (num) return `n|${num.n}`;
  return `t|${normSong(path.basename(file).replace(/\.[a-z0-9]{2,5}$/i, "")).replace(/\bda ?dung\b/g, " ").replace(/\s+/g, " ").trim()}`;
}

export interface PlaylistPick {
  songs: PoolSong[];
  total: number;
  /** Đủ ít nhất ENOUGH_RATIO độ dài video. */
  enough: boolean;
  /** Tổng thời lượng mọi bản chưa dùng còn trong kho (mỗi bài một bản). */
  available: number;
}

/**
 * Chọn bài cho một video dài `targetSec` giây: bản chưa dùng, mỗi bài một bản (bản số nhỏ trước, WAV trước MP3), bài số nhỏ trước rồi tới
 * bài đặt theo tên; `first` (tên bài ghi trong ý tưởng) được đặt lên đầu. Dừng khi đủ độ dài (bài cuối có thể vượt một chút).
 */
export function pickPlaylist(pool: PoolSong[], targetSec: number, opts: { first?: string; taken?: SongTaken } = {}): PlaylistPick {
  const free = pool.filter((s) => s.duration > 0 && !isUsedSong(path.basename(s.file)) && !opts.taken?.(s.file));
  const order = [...free].sort((a, b) => {
    const na = songNumber(path.basename(a.file));
    const nb = songNumber(path.basename(b.file));
    if (na && nb) return na.n - nb.n || na.version - nb.version || extRank(a.file) - extRank(b.file) || a.file.localeCompare(b.file);
    if (na || nb) return na ? -1 : 1;
    return a.file.localeCompare(b.file);
  });
  // Mỗi bài một bản.
  const seen = new Set<string>();
  const one = order.filter((s) => {
    const k = songGroup(s.file);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const pinned = opts.first?.trim() ? pickSong(opts.first, one.map((s) => s.file)) : null;
  const list = pinned ? [one.find((s) => s.file === pinned.file)!, ...one.filter((s) => s.file !== pinned.file)] : one;
  const available = list.reduce((a, s) => a + s.duration, 0);
  const songs: PoolSong[] = [];
  let total = 0;
  for (const s of list) {
    if (total >= targetSec - 1e-6) break;
    songs.push(s);
    total += s.duration;
  }
  return { songs, total, enough: total >= targetSec * ENOUGH_RATIO, available };
}

const titleCase = (s: string) => s.replace(/(^|[\s(-])(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase());

/** Tên bài cho mô tả YouTube: câu hook điệp khúc trong thư viện lời (bài đánh số), không có thì tên file đã làm gọn. */
export function trackTitle(file: string, hooks: Map<number, string>): string {
  const base = path.basename(file);
  const num = songNumber(base);
  if (num) return hooks.get(num.n) || `Christmas Song No. ${num.n}`;
  const stem = base
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/\s*(đã\s*dùng|da\s*dung)\s*/gi, " ")
    .split(/\s+[-–—]\s+/)[0]
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(stem) || base;
}

/** Mốc thời gian kiểu YouTube: "0:00", "3:07", "1:02:03". */
export function chapterTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Các dòng danh sách bài cho mô tả YouTube ("0:00 Snowfall On Main Street") — YouTube tự tạo chương. */
export function tracklistLines(tracks: Pick<PlaylistTrack, "title" | "start">[]): string[] {
  return tracks.map((t) => `${chapterTime(t.start)} ${t.title}`);
}

/** Mô tả YouTube kèm danh sách bài (nếu video dùng nhiều bài) ở cuối, trước dòng hashtag. */
export function withTracklist(description: string, tracks: Pick<PlaylistTrack, "title" | "start">[] | undefined): string {
  const text = description.trim();
  if (!tracks || tracks.length < 2) return text;
  const list = ["Tracklist:", ...tracklistLines(tracks)].join("\n");
  const parts = text.split(/\n\s*\n/);
  const last = parts.at(-1) ?? "";
  // Dòng hashtag cuối giữ ở cuối mô tả.
  if (parts.length > 1 && /^\s*(#[\p{L}\p{N}_]+\s*)+$/u.test(last)) return [...parts.slice(0, -1), list, last].join("\n\n");
  return text ? `${text}\n\n${list}` : list;
}

/** Tên các bài theo thư viện lời (bài đánh số → câu hook). */
export async function libraryHooks(): Promise<Map<number, string>> {
  const lib = await readSongLibrary().catch(() => ({ songs: [] }));
  return new Map(lib.songs.filter((s) => s.hook).map((s) => [s.n, s.hook]));
}

/**
 * Nối các bài thành một file FLAC 48 kHz stereo 16-bit `out` (bài mono được nhân đôi nguyên mức). Trả về danh sách bài kèm mốc bắt đầu.
 */
export async function buildPlaylistAudio(songs: PoolSong[], out: string, hooks: Map<number, string>, signal?: AbortSignal): Promise<PlaylistTrack[]> {
  if (!songs.length) throw new Error("Chưa có bài nào để ghép.");
  const inputs = songs.flatMap((s) => ["-i", s.file]);
  const chains = songs.map((s, i) => `[${i}:a:0]${s.channels === 1 ? "pan=stereo|c0=c0|c1=c0," : ""}aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a${i}]`);
  const graph = `${chains.join(";")};${songs.map((_, i) => `[a${i}]`).join("")}concat=n=${songs.length}:v=0:a=1[out]`;
  await ffmpegOrThrow(
    ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-map_metadata", "-1", "-c:a", "flac", "-sample_fmt", "s16", out],
    "Ghép danh sách nhạc",
    { signal },
  );
  let start = 0;
  return songs.map((s) => {
    const t: PlaylistTrack = { name: path.basename(s.file), title: trackTitle(s.file, hooks), start: Math.round(start * 1000) / 1000, duration: Math.round(s.duration * 1000) / 1000 };
    start += s.duration;
    return t;
  });
}

/** "45 phút" / "1 giờ 2 phút" — tổng thời lượng cho thông báo. */
export function minutesLabel(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60 ? `${m % 60} phút` : ""}`.trim() : `${m} phút`;
}
