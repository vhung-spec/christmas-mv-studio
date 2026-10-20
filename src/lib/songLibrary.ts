// Thư viện lời bài hát của kho nhạc (data/song_library.json): mỗi số bài một mục — địa điểm, chủ đề, dàn ý, lời.
// Tạo từ thư mục bài hát trên Google Drive (mỗi bài một thư mục, tài liệu = 3 dòng ý tưởng + lời). Ý tưởng số N cùng địa điểm
// mà chưa có lời thì dây chuyền lấy lời ở đây, để kịch bản bám đúng các đoạn của bài. Chỉ dùng phía server.

import { normSong } from "./songs";
import { SONG_LIBRARY_FILE, readJson, writeJson } from "./store";
import type { IdeaRow } from "./types";

export interface LibrarySong {
  n: number;
  world_location: string;
  theme_code: string;
  theme_name: string;
  outline: string;
  /** Câu đầu điệp khúc (gợi ý tên bài). */
  hook: string;
  /** Không khí đoạn mở đầu: "Tươi sáng, vỗ tay", "Nhẹ nhàng"… */
  mood: string;
  lyrics: string;
}

export interface SongLibrary {
  updated_at?: string;
  source?: string;
  songs: LibrarySong[];
}

const MOOD = (intro: string) =>
  /soft|gentle/i.test(intro) ? "Nhẹ nhàng" : /driving|slap/i.test(intro) ? "Mạnh, dồn dập" : /bright/i.test(intro) ? "Tươi sáng, vỗ tay" : "";
const titleCase = (s: string) => s.replace(/(^|[\s(-])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase());

/**
 * Đọc tài liệu của một bài (bản text của Google Doc): các dòng trước nhãn "[" đầu tiên là địa điểm, chủ đề ("T01 Sét ái tình"),
 * dàn ý; phần còn lại là lời. null nếu tài liệu trống.
 */
export function parseSongDoc(n: number, text: string): LibrarySong | null {
  const lines = text.replace(/^﻿/, "").replace(/\r/g, "").split("\n").map((l) => l.trim());
  const start = lines.findIndex((l) => l.startsWith("["));
  const [world_location = "", themeCell = "", outline = ""] = lines.slice(0, start < 0 ? lines.length : start).filter(Boolean);
  if (!world_location) return null;
  const body = start < 0 ? [] : lines.slice(start);
  const tm = themeCell.match(/^T\s*(\d{1,2})\s*[–-]?\s*(.*)$/i);
  const intro = (body.find((l) => /^\[intro/i.test(l)) ?? "").replace(/^\[intro\s*[-–]?\s*/i, "").replace(/\]$/, "");
  const ci = body.findIndex((l) => /^\[chorus/i.test(l));
  const hook = ci < 0 ? "" : (body.slice(ci + 1).find((l) => l && !l.startsWith("[")) ?? "").replace(/^\([^)]*\)\s*/, "").replace(/[,.!]+$/, "");
  return {
    n,
    world_location,
    theme_code: tm ? `T${tm[1].padStart(2, "0")}` : "",
    theme_name: tm?.[2].trim() ?? "",
    outline,
    hook: hook ? titleCase(hook) : "",
    mood: MOOD(intro),
    lyrics: body.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export async function writeSongLibrary(lib: SongLibrary): Promise<void> {
  await writeJson(SONG_LIBRARY_FILE(), { ...lib, songs: [...lib.songs].sort((a, b) => a.n - b.n) });
}

export async function readSongLibrary(): Promise<SongLibrary> {
  const lib = await readJson<Partial<SongLibrary>>(SONG_LIBRARY_FILE(), {});
  return { ...lib, songs: Array.isArray(lib.songs) ? lib.songs : [] };
}

/** Bài trong thư viện ứng với ý tưởng: cùng số và cùng địa điểm (ý tưởng Claude đề xuất số 201… không trùng địa điểm → không lấy nhầm). */
export async function librarySongFor(idea: Pick<IdeaRow, "id" | "world_location">): Promise<LibrarySong | null> {
  if (!/^\d+$/.test(idea.id)) return null;
  const n = Number(idea.id);
  const hit = (await readSongLibrary()).songs.find((s) => s.n === n);
  return hit && hit.lyrics?.trim() && normSong(hit.world_location) === normSong(idea.world_location) ? hit : null;
}
