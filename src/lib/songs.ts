// File nhạc trong Thư mục nhạc: liệt kê file, đọc số bài / số bản trong tên file ("12.wav", "12 (1).wav", "76_1.mp3"), so tên bỏ dấu.
// Chọn bài nào cho video: tự xếp bài kiểu Bokin theo lịch sử kênh (channels.ts) trên kho nhạc (musicLibrary.ts). Chỉ dùng phía server.

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

/** Số bài và số bản trong tên file: "12 (1).wav" → { n: 12, version: 1 }; tên không bắt đầu bằng số → null. */
export function songNumber(fileName: string): { n: number; version: number } | null {
  const m = path.basename(fileName).match(/^0*(\d{1,4})(?!\d)\s*(?:\((\d+)\)|_(\d+))?/);
  return m ? { n: Number(m[1]), version: Number(m[2] ?? m[3] ?? 0) } : null;
}
