// DANH SÁCH NHẠC CỦA VIDEO DÀI — video Giáng sinh khoảng 1 tiếng dùng nhiều bài nối nhau (Cài đặt → Độ dài video).
// Chọn bài nào, thứ tự ra sao: tự xếp bài kiểu Bokin Playlist Studio theo lịch sử từng kênh (channels.ts) trên kho nhạc
// (musicLibrary.ts: Kho bài hát.xlsx + Thư mục nhạc). Ở đây: đo thời lượng file, nối các bài thành một file FLAC (không mất chất
// lượng), ghi lại bài nào bắt đầu ở giây nào và viết danh sách bài (kèm mốc thời gian) vào mô tả YouTube.

import { promises as fs } from "node:fs";
import path from "node:path";
import { ffmpegOrThrow, probe } from "./ffmpeg";
import { chapterTime, tracklistLines } from "./chapters";
import { readSongLibrary } from "./songLibrary";
import { songNumber } from "./songs";
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

const titleCase = (s: string) => s.replace(/(^|[\s(-])(\p{Ll})/gu, (_m, p: string, c: string) => p + c.toUpperCase());

/** Tên bài khi bài chưa có trong Kho bài hát.xlsx: câu hook điệp khúc trong thư viện lời (bài đánh số), không có thì tên file đã làm gọn. */
export function trackTitle(file: string, hooks: Map<number, string>): string {
  const base = path.basename(file).normalize("NFC");
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

// Mốc thời gian + dòng danh sách bài nằm ở chapters.ts (trình duyệt cũng dùng).
export { chapterTime, tracklistLines };

/** Mô tả YouTube kèm danh sách bài (nếu video dùng nhiều bài khác nhau — MV phát một bài nhiều lần thì không) ở cuối, trước dòng hashtag. */
export function withTracklist(description: string, tracks: Pick<PlaylistTrack, "title" | "start">[] | undefined): string {
  const text = description.trim();
  if (!tracks || new Set(tracks.map((t) => t.title)).size < 2) return text;
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

/** Một bài để nối: file (bản đã chọn), thời lượng, số kênh tiếng, tên hiện trong danh sách bài. */
export interface PlaylistItem extends PoolSong {
  title: string;
  /** Mã bài trong kho (ghi vào danh sách bài của video). */
  code?: string;
}

/**
 * Nối các bài thành một file FLAC 48 kHz stereo 16-bit `out` (bài mono được nhân đôi nguyên mức). Trả về danh sách bài kèm mốc bắt đầu.
 */
export async function buildPlaylistAudio(items: PlaylistItem[], out: string, signal?: AbortSignal): Promise<PlaylistTrack[]> {
  if (!items.length) throw new Error("Chưa có bài nào để ghép.");
  const inputs = items.flatMap((s) => ["-i", s.file]);
  const chains = items.map((s, i) => `[${i}:a:0]${s.channels === 1 ? "pan=stereo|c0=c0|c1=c0," : ""}aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo[a${i}]`);
  const graph = `${chains.join(";")};${items.map((_, i) => `[a${i}]`).join("")}concat=n=${items.length}:v=0:a=1[out]`;
  await ffmpegOrThrow(
    ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-map_metadata", "-1", "-c:a", "flac", "-sample_fmt", "s16", out],
    "Ghép danh sách nhạc",
    { signal },
  );
  let start = 0;
  return items.map((s) => {
    const t: PlaylistTrack = {
      name: path.basename(s.file),
      title: s.title,
      start: Math.round(start * 1000) / 1000,
      duration: Math.round(s.duration * 1000) / 1000,
      ...(s.code ? { code: s.code } : {}),
    };
    start += s.duration;
    return t;
  });
}

/** "45 phút" / "1 giờ 2 phút" — tổng thời lượng cho thông báo. */
export function minutesLabel(sec: number): string {
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} giờ ${m % 60 ? `${m % 60} phút` : ""}`.trim() : `${m} phút`;
}
