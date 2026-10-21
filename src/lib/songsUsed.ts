// Sổ bài đã dùng (data/songs_used.json): bài nhạc nào đã ghép vào MV thì không lấy lại cho MV khác — kể cả khi tên file chưa có
// chữ "đã dùng" (app không sửa được Drive), kể cả khi MV đó bị xoá sau này. MV làm trước khi có sổ (hoặc bạn tự tải nhạc lên ở trang
// Ghép video) được tự thêm vào sổ ở lần đọc sau. Danh sách này cũng cho bạn biết bài nào cần ghi "đã dùng" trên Drive.

import path from "node:path";
import { loadProject } from "./media";
import { isUsedSong, listSongs, songKey, type SongTaken } from "./songs";
import { SONGS_USED_FILE, listMVs, readJson, withLock, writeJson } from "./store";

export interface UsedSong {
  /** songKey của file: cùng bài dù tên file đổi (Drive thêm "đã dùng", bản WAV / MP3). */
  key: string;
  /** Tên file lúc ghép vào MV. */
  file: string;
  mv_id: string;
  /** "#12 · Hollywood Boulevard Summer 1954". */
  title: string;
  at: string;
}

interface SongsUsedFile {
  songs: UsedSong[];
}

const readFile = () => readJson<SongsUsedFile>(SONGS_USED_FILE(), { songs: [] });

function update<T>(fn: (s: SongsUsedFile) => T): Promise<T> {
  return withLock("songs-used", async () => {
    const s = await readFile();
    const out = fn(s);
    await writeJson(SONGS_USED_FILE(), s);
    return out;
  });
}

const mvTitle = (idea: { id: string; song_title?: string; world_location: string }) =>
  `${/^\d+$/.test(idea.id) ? `#${idea.id} · ` : ""}${idea.song_title || idea.world_location}`;

/** Ghi vào sổ: bài `file` đã ghép vào MV `mvId`. */
export function recordUsedSong(mvId: string, file: string, title: string): Promise<void> {
  const name = path.basename(file);
  const key = songKey(name);
  return update((s) => {
    if (s.songs.some((x) => x.key === key && x.mv_id === mvId)) return;
    s.songs.push({ key, file: name, mv_id: mvId, title, at: new Date().toISOString() });
  });
}

/**
 * Đọc sổ, thêm các MV đã có bài hát mà chưa có trong sổ (MV làm trước khi có sổ, nhạc tự tải lên). Mới nhất trước.
 */
export async function readUsedSongs(): Promise<UsedSong[]> {
  const book = await readFile();
  const known = new Set(book.songs.map((x) => x.mv_id));
  const found: UsedSong[] = [];
  for (const mv of await listMVs()) {
    if (known.has(mv.id)) continue;
    const audio = (await loadProject(mv.id).catch(() => null))?.audio;
    if (audio?.name) found.push({ key: songKey(audio.name), file: audio.name, mv_id: mv.id, title: mvTitle(mv.idea), at: audio.uploaded_at || mv.created_at });
  }
  const songs = found.length
    ? await update((s) => {
        const have = new Set(s.songs.map((x) => `${x.key}#${x.mv_id}`));
        s.songs.push(...found.filter((x) => !have.has(`${x.key}#${x.mv_id}`)));
        return s.songs;
      })
    : book.songs;
  return [...songs].sort((a, b) => b.at.localeCompare(a.at));
}

/** Bài đã ghép vào MV khác (không tính MV `mvId` — chọn lại bài cho chính MV đó vẫn được). */
export function takenBy(used: UsedSong[], mvId?: string): SongTaken {
  const keys = new Set(used.filter((x) => x.mv_id !== mvId).map((x) => x.key));
  return (file) => keys.has(songKey(file));
}

export interface UsedSongRow extends UsedSong {
  /** File của bài này trong Thư mục nhạc đã có chữ "đã dùng" (bạn đã ghi trên Drive, app đã đồng bộ tên). */
  marked: boolean;
}

/** Bài app đã dùng, kèm đã ghi "đã dùng" trên Drive chưa (theo tên file trong Thư mục nhạc). Chưa ghi trước, mới nhất trước. */
export async function usedSongRows(songDir: string): Promise<UsedSongRow[]> {
  const used = await readUsedSongs();
  const files = songDir.trim() ? await listSongs(songDir.trim()).catch(() => []) : [];
  const marked = new Set(files.filter((f) => isUsedSong(path.basename(f))).map((f) => songKey(f)));
  return used.map((x) => ({ ...x, marked: marked.has(x.key) })).sort((a, b) => Number(a.marked) - Number(b.marked));
}
