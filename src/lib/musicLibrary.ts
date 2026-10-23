// KHO NHẠC CỦA APP = tệp "Kho bài hát.xlsx" (mẫu Bokin: mã bài, tên bài, mức hay — songSheet.ts) + các file nhạc trong Thư mục nhạc.
// Mỗi bài có một hoặc nhiều bản (kho đánh số như KHO NHẠC: "12.wav", "12 (1).wav" là hai bản của bài 12); bài có trong Thư mục nhạc
// mà chưa có trong tệp Excel vẫn dùng được, coi là mức 1 (bình thường). Chữ "đã dùng" trong tên file không còn ý nghĩa: app tự nhớ
// kênh nào đã dùng bài nào (channels.ts). Chỉ dùng phía server.

import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { libraryHooks, songDurations, trackTitle, type PoolSong } from "./playlist";
import { REUSE, SHEET_FILE, SheetError, isSheetName, parseSheet, plain, readSheet, type Level, type ReuseRule } from "./songSheet";
import { listSongs, songNumber } from "./songs";

export interface LibVersion {
  file: string;
  name: string;
  duration: number;
  channels: number | null;
}

export interface LibSong {
  code: string;
  title: string;
  level: Level;
  reuse: ReuseRule;
  excluded: boolean;
  /** Các bản của bài (bản đầu = bản chính: file ghi trong tệp Excel, hoặc bản số nhỏ nhất). */
  versions: LibVersion[];
  /** Có file nhạc đọc được. */
  exists: boolean;
  /** Bài có dòng trong tệp Excel. */
  inSheet: boolean;
  /** Số dòng trong tệp Excel. */
  row?: number;
}

export interface LibProblem {
  /** Số dòng trong tệp Excel; null = không gắn với dòng nào. */
  row: number | null;
  message: string;
}

export interface MusicLibrary {
  songs: LibSong[];
  /** Tệp Excel đang dùng; null = chưa có (mọi bài mức 1). */
  sheet: string | null;
  problems: LibProblem[];
}

const extRank = (file: string) => (/\.(wav|flac|aiff?)$/i.test(file) ? 0 : 1);
/** Tên file để so: không dấu, chữ thường (tên file trên Windows / Drive có thể là NFD). */
const nameKey = (file: string) => plain(path.basename(file));
/** Hai đường dẫn cùng một file (không phân biệt hoa thường, NFC / NFD). */
const samePath = (a: string, b: string) => path.resolve(a).normalize("NFC").toLowerCase() === path.resolve(b).normalize("NFC").toLowerCase();
/** Mã bài là số (hoặc chữ + số, vd. "B012", "GS-12") → số bài để tìm file đánh số; null nếu không có số. */
const codeNumber = (code: string) => {
  const m = code.match(/(\d{1,4})\s*$/);
  return m ? Number(m[1]) : null;
};
const toVersion = (p: PoolSong): LibVersion => ({ file: p.file, name: path.basename(p.file), duration: p.duration, channels: p.channels });

/**
 * Tệp Excel của kho: `setting` (đường dẫn tuyệt đối, hoặc tương đối với Thư mục nhạc), để trống thì tự tìm "Kho bài hát.xlsx" (hoặc
 * .csv) trong Thư mục nhạc (cả thư mục con một cấp). null nếu không có.
 */
export async function findSheet(songDir: string, setting = ""): Promise<string | null> {
  const dir = songDir.trim();
  if (setting.trim()) {
    const p = path.isAbsolute(setting.trim()) ? setting.trim() : path.resolve(/*turbopackIgnore: true*/ dir || ".", setting.trim());
    return existsSync(/*turbopackIgnore: true*/ p) ? p : null;
  }
  if (!dir) return null;
  const scan = async (d: string, depth: number): Promise<string | null> => {
    let entries;
    try {
      entries = await fs.readdir(/*turbopackIgnore: true*/ d, { withFileTypes: true });
    } catch {
      return null;
    }
    // .xlsx trước .csv (thư mục có thể có cả hai).
    const hit = entries
      .filter((e) => e.isFile() && isSheetName(e.name))
      .map((e) => e.name)
      .sort((a, b) => Number(/\.csv$/i.test(a)) - Number(/\.csv$/i.test(b)))[0];
    if (hit) return path.join(/*turbopackIgnore: true*/ d, hit);
    if (depth > 0) {
      for (const e of entries.filter((x) => x.isDirectory())) {
        const sub = await scan(path.join(/*turbopackIgnore: true*/ d, e.name), depth - 1);
        if (sub) return sub;
      }
    }
    return null;
  };
  return scan(dir, 1);
}

/** Đọc kho: tệp Excel (nếu có) + file nhạc trong Thư mục nhạc. Không có Thư mục nhạc → kho rỗng. */
export async function loadMusicLibrary(songDir: string, sheetSetting = ""): Promise<MusicLibrary> {
  const dir = songDir.trim();
  const problems: LibProblem[] = [];
  const all = (await songDurations(dir ? await listSongs(dir).catch(() => [] as string[]) : [])).map(toVersion);

  // File nhạc theo số bài (mọi bản, bản số nhỏ trước, WAV trước MP3) và các file đặt theo tên.
  const byNumber = new Map<number, LibVersion[]>();
  for (const v of all) {
    const num = songNumber(v.name);
    if (num) byNumber.set(num.n, [...(byNumber.get(num.n) ?? []), v]);
  }
  for (const list of byNumber.values()) {
    list.sort((a, b) => songNumber(a.name)!.version - songNumber(b.name)!.version || extRank(a.name) - extRank(b.name) || a.name.localeCompare(b.name));
  }
  const claimed = new Set<string>();
  const songs: LibSong[] = [];

  // 1. Tệp Excel.
  const sheet = await findSheet(dir, sheetSetting);
  if (sheet) {
    try {
      const parsed = parseSheet(await readSheet(sheet));
      problems.push(...parsed.problems);
      for (const r of parsed.rows) {
        let versions: LibVersion[] = [];
        if (r.file) {
          // Tệp nhạc tính từ thư mục chứa tệp Excel; Drive tải nhạc về một thư mục phẳng → không thấy thì tìm theo tên file.
          const wanted = path.resolve(/*turbopackIgnore: true*/ path.dirname(sheet), r.file.replace(/\\/g, "/"));
          let hit = all.find((v) => samePath(v.file, wanted)) ?? all.find((v) => nameKey(v.file) === nameKey(wanted));
          if (!hit && existsSync(/*turbopackIgnore: true*/ wanted)) hit = (await songDurations([wanted])).map(toVersion)[0];
          if (hit) {
            const num = songNumber(hit.name);
            // File đánh số: các bản khác của cùng bài đi kèm (bản ghi trong tệp đứng đầu).
            versions = num ? [hit, ...(byNumber.get(num.n) ?? []).filter((v) => !samePath(v.file, hit.file))] : [hit];
          } else {
            problems.push({ row: r.row, message: `không thấy tệp nhạc ${r.file}` });
          }
        } else {
          const n = codeNumber(r.code);
          versions = n === null ? [] : (byNumber.get(n) ?? []);
          if (!versions.length) {
            problems.push({ row: r.row, message: `không thấy file nhạc của mã ${r.code} (ghi cột Tệp nhạc, hoặc đặt tên file theo số, vd. ${n ?? 12}.wav)` });
          }
        }
        for (const v of versions) claimed.add(path.resolve(v.file));
        songs.push({ code: r.code, title: r.title, level: r.level, reuse: r.reuse, excluded: r.excluded, versions, exists: versions.length > 0, inSheet: true, row: r.row });
      }
    } catch (err) {
      if (!(err instanceof SheetError)) throw err;
      problems.push({ row: null, message: `${path.basename(sheet)}: ${err.message}` });
    }
  }

  // 2. Bài trong Thư mục nhạc chưa có trong tệp Excel: mức 1 (bài đánh số: mã = số bài; bài đặt theo tên: mã = tên file).
  const hooks = await libraryHooks();
  const codes = new Set(songs.map((s) => plain(s.code)));
  const add = (code: string, versions: LibVersion[]) => {
    if (codes.has(plain(code))) {
      problems.push({ row: null, message: `${versions[0].name}: mã ${code} đã dùng cho bài khác trong ${SHEET_FILE} — bỏ qua file này` });
      return;
    }
    codes.add(plain(code));
    songs.push({ code, title: trackTitle(versions[0].file, hooks), level: 1, reuse: "normal", excluded: false, versions, exists: true, inSheet: false });
  };
  for (const [n, versions] of [...byNumber].sort((a, b) => a[0] - b[0])) {
    const rest = versions.filter((v) => !claimed.has(path.resolve(v.file)));
    if (rest.length) add(String(n), rest);
  }
  for (const v of all.filter((x) => !songNumber(x.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    if (claimed.has(path.resolve(v.file))) continue;
    const stem = v.name.normalize("NFC").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/\s*(đã\s*dùng|da\s*dung)\s*/gi, " ").trim();
    add(stem || v.name, [v]);
  }
  return { songs, sheet, problems };
}

/** Hệ số nghỉ của bài (Thưa hơn = ×0,5 …), như REUSE của Bokin. */
export const reuseFactor = (s: Pick<LibSong, "reuse">) => REUSE[s.reuse].factor;
