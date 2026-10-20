// Thư viện lời bài hát của kho nhạc (data/song_library.json): mỗi số bài một mục — địa điểm, chủ đề, dàn ý, lời.
// Tạo từ thư mục bài hát trên Google Drive (mỗi bài một thư mục, tài liệu = 3 dòng ý tưởng + lời). Ý tưởng số N cùng địa điểm
// mà chưa có lời thì dây chuyền lấy lời ở đây, để kịch bản bám đúng các đoạn của bài. Chỉ dùng phía server.

import { normSong } from "./songs";
import { SONG_LIBRARY_FILE, readJson } from "./store";
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
