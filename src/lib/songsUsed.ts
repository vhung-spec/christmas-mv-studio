// Sổ bài đã dùng (data/songs_used.json): bài nhạc nào đã ghép vào MV thì không lấy lại cho MV khác — kể cả khi tên file chưa có
// chữ "đã dùng" (app không sửa được Drive), kể cả khi MV đó bị xoá hoặc đổi bài sau này. Bài của các MV làm trước khi có sổ, hoặc bài
// bạn tự tải lên / đổi ở trang Ghép video, được tự thêm vào sổ ở lần đọc sau. Sổ cũng cho bạn biết bài nào cần ghi "đã dùng" trên
// Drive, và MV nào đang dùng trùng một bài.

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
const entryId = (x: { key: string; mv_id: string }) => `${x.key}#${x.mv_id}`;

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

/** Bài hiện đang nằm trong mỗi MV còn trong lịch sử. */
type Current = Map<string, UsedSong>;

/** Đọc sổ và bài hiện có của mọi MV; bài chưa có trong sổ (MV cũ, nhạc tự tải lên / đổi) thì thêm vào sổ. */
async function scan(): Promise<{ songs: UsedSong[]; current: Current }> {
  const book = await readFile();
  const have = new Set(book.songs.map(entryId));
  const current: Current = new Map();
  for (const mv of await listMVs()) {
    const audio = (await loadProject(mv.id).catch(() => null))?.audio;
    if (!audio?.name) continue;
    current.set(mv.id, { key: songKey(audio.name), file: audio.name, mv_id: mv.id, title: mvTitle(mv.idea), at: audio.uploaded_at || mv.created_at });
  }
  const found = [...current.values()].filter((x) => !have.has(entryId(x)));
  const songs = found.length
    ? await update((s) => {
        const ids = new Set(s.songs.map(entryId));
        s.songs.push(...found.filter((x) => !ids.has(entryId(x))));
        return s.songs;
      })
    : book.songs;
  return { songs, current };
}

/** Sổ bài đã dùng (kèm bài của MV chưa có trong sổ), mới nhất trước. */
export async function readUsedSongs(): Promise<UsedSong[]> {
  return [...(await scan()).songs].sort((a, b) => b.at.localeCompare(a.at));
}

/** Bài đã ghép vào MV khác (không tính MV `mvId` — chọn lại bài cho chính MV đó vẫn được). */
export function takenBy(used: UsedSong[], mvId?: string): SongTaken {
  const keys = new Set(used.filter((x) => x.mv_id !== mvId).map((x) => x.key));
  return (file) => keys.has(songKey(file));
}

export interface UsedSongRow {
  key: string;
  /** Tên file lúc ghép vào MV gần nhất. */
  file: string;
  /** Các MV đã dùng bài này (MV đã xoá hoặc đã đổi bài vẫn còn trong sổ). */
  mvs: { mv_id: string; title: string }[];
  at: string;
  /** File của bài này trong Thư mục nhạc đã có chữ "đã dùng" (bạn đã ghi trên Drive, app đã đồng bộ tên). */
  marked: boolean;
}

export interface UsedSongsView {
  /** Mỗi bài một dòng: chưa ghi "đã dùng" trên Drive trước, mới nhất trước. */
  rows: UsedSongRow[];
  /** Các bài đang nằm trong từ 2 MV trở lên (MV làm trước khi có sổ bài đã dùng). */
  duplicates: { file: string; mvs: { mv_id: string; title: string }[] }[];
}

/** Sổ bài đã dùng cho giao diện: bài cần ghi "đã dùng" trên Drive, và MV đang dùng trùng một bài. */
export async function usedSongsView(songDir: string): Promise<UsedSongsView> {
  const { songs, current } = await scan();
  const files = songDir.trim() ? await listSongs(songDir.trim()).catch(() => []) : [];
  const marked = new Set(files.filter((f) => isUsedSong(path.basename(f))).map((f) => songKey(f)));
  const byKey = new Map<string, UsedSongRow>();
  for (const x of [...songs].sort((a, b) => a.at.localeCompare(b.at))) {
    const row = byKey.get(x.key) ?? { key: x.key, file: x.file, mvs: [], at: x.at, marked: marked.has(x.key) };
    if (!row.mvs.some((m) => m.mv_id === x.mv_id)) row.mvs.push({ mv_id: x.mv_id, title: x.title });
    Object.assign(row, { file: x.file, at: x.at });
    byKey.set(x.key, row);
  }
  const rows = [...byKey.values()].sort((a, b) => Number(a.marked) - Number(b.marked) || b.at.localeCompare(a.at));
  const now = new Map<string, UsedSong[]>();
  for (const x of current.values()) now.set(x.key, [...(now.get(x.key) ?? []), x]);
  const duplicates = [...now.values()]
    .filter((list) => list.length > 1)
    .map((list) => ({ file: list[0].file, mvs: list.sort((a, b) => a.at.localeCompare(b.at)).map((x) => ({ mv_id: x.mv_id, title: x.title })) }));
  return { rows, duplicates };
}
