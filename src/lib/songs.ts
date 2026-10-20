// Tự ghép bài hát: tìm file nhạc trùng tên bài trong thư mục nhạc (Cài đặt → Thư mục nhạc). Phần đọc thư mục chỉ dùng phía server.
// Tên file kiểu "Đèn Khuya - Rock Version.wav", "Anh Còn Nợ Em - Nam Metal Rock.WAV", "Sương Lạnh Chiều Đông1 - nam metal rock.wav".

import { promises as fs } from "node:fs";
import path from "node:path";
import { AUDIO_EXT } from "./media";

/** Bỏ dấu, chữ thường, chỉ giữ chữ / số (cách nhau một khoảng trắng). */
export function normSong(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Tên bài trong tên file: bỏ đuôi, phần sau " - " (phiên bản: Rock Version, Nam Metal Rock…), chữ "rock" / số dính ở cuối. */
export function songBase(fileName: string): string {
  const stem = fileName.replace(/\.[a-z0-9]{2,5}$/i, "");
  const head = stem.split(/\s+[-–—]\s+/)[0];
  return normSong(head)
    .replace(/(\s+(rock|version|ver|remix|cover|metal))+$/, "")
    .replace(/\d+$/, "")
    .trim();
}

/**
 * Độ khớp giữa tên bài của MV và một file nhạc (0–1): trùng cả tên file (kể cả phiên bản) > trùng tên bài > một bên chứa bên kia > nhiều từ chung.
 * Tên bài của MV ghi rõ phiên bản (vd. "Đèn Khuya - Nam Rock") thì chọn đúng file phiên bản đó.
 */
export function songScore(title: string, fileName: string): number {
  const t = normSong(title);
  if (!t) return 0;
  const full = normSong(fileName.replace(/\.[a-z0-9]{2,5}$/i, ""));
  if (t === full) return 1;
  const base = songBase(fileName);
  const tb = songBase(title);
  if (!base) return 0;
  if (t === base || tb === base) return 0.95;
  // Một bên chứa trọn bên kia — chỉ tính khi tên ngắn hơn có từ 2 chữ và phủ phần lớn tên dài (tránh "Đêm" khớp "Đêm lang thang").
  const pad = (s: string) => ` ${s} `;
  const [short, long] = t.length <= base.length ? [t, base] : [base, t];
  const words = (s: string) => s.split(" ").length;
  if (pad(long).includes(pad(short)) && words(short) >= 2 && words(short) / words(long) >= 0.6) return 0.8;
  const a = new Set(t.split(" "));
  const b = new Set(base.split(" "));
  const common = [...a].filter((w) => b.has(w)).length;
  const jaccard = common / new Set([...a, ...b]).size;
  return jaccard >= 0.6 ? 0.6 * jaccard : 0;
}

/** Chọn file khớp nhất (≥ 0.5); hai file khớp ngang nhau → lấy file đầu theo tên (báo lại để người dùng biết). */
export function pickSong(title: string, files: string[]): { file: string; score: number; ties: number } | null {
  const scored = files
    .map((file) => ({ file, score: songScore(title, path.basename(file)) }))
    .filter((x) => x.score >= 0.5)
    .sort((x, y) => y.score - x.score || x.file.localeCompare(y.file));
  if (!scored.length) return null;
  return { ...scored[0], ties: scored.filter((x) => x.score === scored[0].score).length - 1 };
}

/** Các file nhạc trong thư mục (cả thư mục con, tối đa 2 cấp). */
export async function listSongs(dir: string, depth = 2): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(/*turbopackIgnore: true*/ dir, { withFileTypes: true });
  } catch {
    throw new Error(`Không mở được thư mục nhạc "${dir}".`);
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(/*turbopackIgnore: true*/ dir, e.name);
    if (e.isDirectory() && depth > 1) out.push(...(await listSongs(p, depth - 1).catch(() => [])));
    else if (e.isFile() && AUDIO_EXT.includes(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

/** Tìm bài cho MV trong thư mục nhạc; null nếu không có thư mục / không có tên bài / không thấy. */
export async function findSong(dir: string, title: string | undefined): Promise<{ file: string; score: number; ties: number } | null> {
  if (!dir.trim() || !title?.trim()) return null;
  return pickSong(title, await listSongs(dir.trim()));
}

// ---------- Kho nhạc đánh số theo ý tưởng: "12.wav", "12 (1).wav", "76_1.mp3", "8 (1) đã dùng.wav" ----------

/** Tên file có chữ "đã dùng" ("da dung", "dadung") — bạn đánh dấu bản nhạc đã làm MV. */
export function isUsedSong(fileName: string): boolean {
  return /\bda ?dung\b|\d(da ?dung)\b/.test(normSong(fileName));
}

/** Số bài và số bản trong tên file: "12 (1).wav" → { n: 12, version: 1 }; tên không bắt đầu bằng số → null. */
export function songNumber(fileName: string): { n: number; version: number } | null {
  const m = path.basename(fileName).match(/^0*(\d{1,4})(?!\d)\s*(?:\((\d+)\)|_(\d+))?/);
  return m ? { n: Number(m[1]), version: Number(m[2] ?? m[3] ?? 0) } : null;
}

const extRank = (file: string) => (/\.(wav|flac|aiff?)$/i.test(file) ? 0 : 1);

export interface NumberedSong {
  file: string;
  /** Bản được chọn đã có chữ "đã dùng" (mọi bản của bài đều đã dùng). */
  used: boolean;
  total: number;
  free: number;
}

/** File của bài số n: bản chưa dùng trước (theo thứ tự bản, WAV trước MP3); bài không có file → null. */
export function pickSongByNumber(n: number, files: string[]): NumberedSong | null {
  const mine = files
    .map((file) => ({ file, num: songNumber(file), used: isUsedSong(path.basename(file)) }))
    .filter((x) => x.num?.n === n)
    .sort((a, b) => Number(a.used) - Number(b.used) || a.num!.version - b.num!.version || extRank(a.file) - extRank(b.file) || a.file.localeCompare(b.file));
  if (!mine.length) return null;
  return { file: mine[0].file, used: mine[0].used, total: mine.length, free: mine.filter((x) => !x.used).length };
}

export type SongMatch = { file: string; by: "title"; ties: number } | ({ by: "number"; n: number } & NumberedSong);

/**
 * Bài cho một ý tưởng: trùng tên bài (nếu ý tưởng có tên bài), không thấy thì theo số ý tưởng (ý tưởng 12 → "12.wav", "12 (1).wav"…),
 * cuối cùng thử tên dự phòng (vd. địa điểm). null nếu không có thư mục nhạc hoặc không thấy.
 */
export async function findSongForIdea(dir: string, idea: { id: string; song_title?: string }, fallbackTitle?: string): Promise<SongMatch | null> {
  if (!dir.trim()) return null;
  return matchSongForIdea(await listSongs(dir.trim()), idea, fallbackTitle);
}

/** Như findSongForIdea nhưng trên danh sách file đã đọc sẵn (xét nhiều ý tưởng mà chỉ đọc thư mục một lần). */
export function matchSongForIdea(files: string[], idea: { id: string; song_title?: string }, fallbackTitle?: string): SongMatch | null {
  const byTitle = (t?: string) => (t?.trim() ? pickSong(t, files) : null);
  const hit = byTitle(idea.song_title);
  if (hit) return { file: hit.file, by: "title", ties: hit.ties };
  if (/^\d+$/.test(idea.id)) {
    const num = pickSongByNumber(Number(idea.id), files);
    if (num) return { by: "number", n: Number(idea.id), ...num };
  }
  const fb = byTitle(fallbackTitle);
  return fb ? { file: fb.file, by: "title", ties: fb.ties } : null;
}
