// KHO BÀI HÁT — cùng mẫu với Bokin Playlist Studio (loop_music/library.py): tệp "Kho bài hát.xlsx" (hoặc CSV UTF-8), mỗi dòng một bài:
//   Mã bài (cố định — lịch sử kênh ghi theo mã), Tên bài (hiện trong danh sách bài trên YouTube), Tệp nhạc (tính từ thư mục chứa
//   tệp Excel; để trống thì app lấy file nhạc đánh số theo mã, vd. mã 12 → "12.wav", "12 (1).wav"), Mức hay (3 = rất hay,
//   2 = hay, 1 = bình thường; để trống = 1), tuỳ chọn Nghệ sĩ, Thể loại, Ghi chú; thêm cột tuỳ chọn Dùng lại (Bình thường /
//   Thưa hơn / Rất thưa / Không dùng lại / Loại khỏi kho — như "tần suất dùng lại" của Bokin, ở đây ghi ngay trong tệp).
// Tiêu đề cột so không dấu, không phân biệt hoa thường, có các tên gọi khác như Bokin; dòng lỗi được báo lại theo số dòng.
// Chỉ dùng phía server.

import { promises as fs } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import Papa from "papaparse";

export const SHEET_FILE = "Kho bài hát.xlsx";
export const SHEET_TAB = "Kho bài hát";
export type Level = 1 | 2 | 3;
export const LEVELS: Record<Level, string> = { 3: "rất hay", 2: "hay", 1: "bình thường" };
/** Bài mức này trở lên được dùng lại làm "bài cũ" ở các video sau (Bokin: REUSED_FROM = 2). */
export const REUSED_FROM = 2;

/** Bài đã dùng quay lại thưa đến đâu: thời gian nghỉ kể từ lần dùng gần nhất nhân hệ số này (Bokin: channels.REUSE). */
export type ReuseRule = "normal" | "less" | "rare" | "never";
export const REUSE: Record<ReuseRule, { label: string; factor: number }> = {
  normal: { label: "Bình thường", factor: 1 },
  less: { label: "Thưa hơn", factor: 0.5 },
  rare: { label: "Rất thưa", factor: 0.25 },
  never: { label: "Không dùng lại", factor: 0 },
};

export class SheetError extends Error {}

type Key = "code" | "title" | "file" | "level" | "reuse" | "artist" | "genre" | "note";

/** (cột, tiêu đề, bắt buộc). "Tệp nhạc" không bắt buộc ở app này: bài theo số lấy file đánh số trong Thư mục nhạc. */
const COLUMNS: { key: Key; header: string; required: boolean }[] = [
  { key: "code", header: "Mã bài", required: true },
  { key: "title", header: "Tên bài", required: true },
  { key: "file", header: "Tệp nhạc", required: false },
  { key: "level", header: "Mức hay", required: true },
  { key: "reuse", header: "Dùng lại", required: false },
  { key: "artist", header: "Nghệ sĩ", required: false },
  { key: "genre", header: "Thể loại", required: false },
  { key: "note", header: "Ghi chú", required: false },
];

/** Tên khác người ta hay đặt cho cùng một cột (so không dấu) — như ALIASES của Bokin, thêm cột Dùng lại. */
const ALIASES: Record<Key, string[]> = {
  code: ["ma bai", "ma", "id", "code", "ma so"],
  title: ["ten bai", "ten bai hat", "ten", "title", "bai hat"],
  file: ["tep nhac", "tep", "file", "duong dan", "ten tep", "file nhac"],
  level: ["muc hay", "muc do hay", "muc", "danh gia", "hay", "rating", "diem", "xep loai", "chat luong"],
  reuse: ["dung lai", "tan suat", "tan suat dung lai", "lap lai"],
  artist: ["nghe si", "ca si", "tac gia", "artist"],
  genre: ["the loai", "dong nhac", "genre"],
  note: ["ghi chu", "note", "notes"],
};

const LEVEL_WORDS: Record<string, Level> = { "rat hay": 3, "hay nhat": 3, hay: 2, "binh thuong": 1, thuong: 1, "khong hay": 1, "": 1 };
const REUSE_WORDS: Record<string, ReuseRule | "excluded"> = {
  "": "normal",
  "binh thuong": "normal",
  "thua hon": "less",
  "it hon": "less",
  "rat thua": "rare",
  "khong dung lai": "never",
  "loai khoi kho": "excluded",
  "loai khoi kenh": "excluded",
  loai: "excluded",
};

/** Chữ thường, bỏ dấu, một dấu cách — cách so tiêu đề cột, mức hay và mã bài (như plain() của Bokin). */
export function plain(text: unknown): string {
  return String(text ?? "")
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Mức hay 1, 2 hoặc 3 (3 = rất hay); để trống = 1; ★★ = 2; chữ "rất hay" / "hay" / "bình thường" cũng được. */
export function parseLevel(text: string): Level {
  const word = plain(text);
  if (/^[1-3](\.0+)?$/.test(word)) return Number(word[0]) as Level;
  if (word in LEVEL_WORDS) return LEVEL_WORDS[word];
  const stars = String(text).trim();
  if (stars.length >= 1 && stars.length <= 3 && /^[*★]+$/.test(stars)) return stars.length as Level;
  throw new SheetError(`không hiểu mức hay "${text}" (ghi 1, 2 hoặc 3; 3 = rất hay)`);
}

/** Cột Dùng lại: Bình thường (trống) / Thưa hơn / Rất thưa / Không dùng lại / Loại khỏi kho. */
export function parseReuse(text: string): ReuseRule | "excluded" {
  const word = plain(text);
  if (word in REUSE_WORDS) return REUSE_WORDS[word];
  throw new SheetError(`không hiểu cột Dùng lại "${text}" (Bình thường / Thưa hơn / Rất thưa / Không dùng lại / Loại khỏi kho)`);
}

/** Dòng tiêu đề (trong 10 dòng đầu) và vị trí từng cột; thiếu cột bắt buộc → SheetError nêu tên cột. */
export function findColumns(rows: string[][]): { header: number; columns: Partial<Record<Key, number>> } {
  const wanted = new Map(COLUMNS.map((c) => [c.key, new Set([plain(c.header), ...ALIASES[c.key]])]));
  for (let index = 0; index < Math.min(rows.length, 10); index++) {
    const found: Partial<Record<Key, number>> = {};
    rows[index].forEach((cell, column) => {
      const name = plain(cell);
      for (const [key, names] of wanted) if (names.has(name) && found[key] === undefined) found[key] = column;
    });
    if (COLUMNS.every((c) => !c.required || found[c.key] !== undefined)) return { header: index, columns: found };
  }
  const missing = COLUMNS.filter((c) => c.required).map((c) => c.header).join(", ");
  throw new SheetError(`Không thấy dòng tiêu đề có đủ các cột: ${missing}.`);
}

export interface SheetRow {
  code: string;
  title: string;
  /** Tệp nhạc như ghi trong tệp ("" = lấy file đánh số theo mã). */
  file: string;
  level: Level;
  reuse: ReuseRule;
  excluded: boolean;
  artist: string;
  genre: string;
  note: string;
  /** Số dòng trong tệp (1 = dòng đầu). */
  row: number;
}

export interface SheetProblem {
  row: number;
  message: string;
}

/** Các dòng bài của bảng (dòng tiêu đề tự tìm). Dòng thiếu mã / tên bài, mức hay sai, mã trùng → bỏ, báo trong problems. */
export function parseSheet(rows: string[][]): { rows: SheetRow[]; problems: SheetProblem[] } {
  const { header, columns } = findColumns(rows);
  const out: SheetRow[] = [];
  const problems: SheetProblem[] = [];
  const codes = new Map<string, number>();
  const cell = (row: string[], key: Key) => {
    const c = columns[key];
    return c === undefined ? "" : String(row[c] ?? "").trim();
  };
  for (let i = header + 1; i < rows.length; i++) {
    const row = rows[i];
    const number = i + 1;
    if (!row.some((x) => String(x ?? "").trim())) continue;
    const missing = [!cell(row, "code") && "Mã bài", !cell(row, "title") && "Tên bài"].filter(Boolean);
    if (missing.length) {
      problems.push({ row: number, message: `thiếu ${missing.join(", ")}` });
      continue;
    }
    let level: Level;
    let reuse: ReuseRule | "excluded";
    try {
      level = parseLevel(cell(row, "level"));
      reuse = parseReuse(cell(row, "reuse"));
    } catch (err) {
      problems.push({ row: number, message: (err as Error).message });
      continue;
    }
    const code = cell(row, "code").split(/\s+/).join(" ");
    const seen = codes.get(plain(code));
    if (seen) {
      problems.push({ row: number, message: `mã ${code} trùng với dòng ${seen}` });
      continue;
    }
    codes.set(plain(code), number);
    out.push({
      code,
      title: cell(row, "title").split(/\s+/).join(" ").normalize("NFC"),
      file: cell(row, "file"),
      level,
      reuse: reuse === "excluded" ? "normal" : reuse,
      excluded: reuse === "excluded",
      artist: cell(row, "artist"),
      genre: cell(row, "genre"),
      note: cell(row, "note"),
      row: number,
    });
  }
  return { rows: out, problems };
}

/** Tên tệp có phải "Kho bài hát.xlsx" / ".csv" (hoặc Google Sheet tên "Kho bài hát", không đuôi) không — so không dấu. */
export function isSheetName(name: string, allowNoExtension = false): boolean {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".xlsx" || ext === ".csv") return plain(name.slice(0, -ext.length)) === plain(SHEET_TAB);
  return allowNoExtension && plain(name) === plain(SHEET_TAB);
}

/** Văn bản của CSV: UTF-8 (có hoặc không BOM), không được thì bảng mã tiếng Việt Windows (cp1258), cuối cùng latin-1. */
function decodeCsv(buf: Buffer): string {
  for (const enc of ["utf-8", "windows-1258"]) {
    try {
      return new TextDecoder(enc, { fatal: true }).decode(buf).replace(/^﻿/, "");
    } catch {
      // thử bảng mã tiếp theo
    }
  }
  return buf.toString("latin1");
}

/** Các dòng chữ của bảng: .xlsx (trang "Kho bài hát", không có thì trang đầu) hoặc .csv (tự nhận dấu phân cách , ; tab). */
export async function readSheet(file: string): Promise<string[][]> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".csv") {
    const parsed = Papa.parse<string[]>(decodeCsv(await fs.readFile(/*turbopackIgnore: true*/ file)), { skipEmptyLines: false });
    return parsed.data.map((r) => r.map((x) => String(x ?? "")));
  }
  if (ext !== ".xlsx") throw new SheetError("Kho bài hát phải là tệp Excel (.xlsx) hoặc CSV (.csv).");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.readFile(/*turbopackIgnore: true*/ file);
  } catch (err) {
    throw new SheetError(`Không đọc được ${path.basename(file)}: ${(err as Error).message}`);
  }
  const ws = wb.getWorksheet(SHEET_TAB) ?? wb.worksheets[0];
  if (!ws) throw new SheetError(`${path.basename(file)} không có trang nào.`);
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const cells: string[] = [];
    for (let c = 1; c <= row.cellCount; c++) cells.push(row.getCell(c).text ?? "");
    rows[n - 1] = cells;
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return rows;
}
