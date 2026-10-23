// Kho bài hát (mẫu Bokin: Mã bài, Tên bài, Tệp nhạc, Mức hay) + gộp với file nhạc trong Thư mục nhạc.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findColumns, isSheetName, parseLevel, parseReuse, parseSheet, plain } from "@/lib/songSheet";

describe("đọc bảng Kho bài hát", () => {
  it("mức hay: số, chữ, sao; để trống = 1; sai thì báo", () => {
    expect(["3", "2.0", "1", "", "Rất hay", "hay", "Bình thường", "★★", "***"].map(parseLevel)).toEqual([3, 2, 1, 1, 3, 2, 1, 2, 3]);
    expect(() => parseLevel("5")).toThrow(/không hiểu mức hay/);
    expect(["", "Thưa hơn", "rất thưa", "Không dùng lại", "Loại khỏi kho"].map(parseReuse)).toEqual(["normal", "less", "rare", "never", "excluded"]);
  });

  it("tìm dòng tiêu đề theo tên cột (không dấu, tên khác); thiếu cột bắt buộc thì báo", () => {
    const rows = [["Kho nhạc Giáng sinh"], ["STT", "Mã", "Tên bài hát", "File", "Đánh giá", "Ghi chú"]];
    expect(findColumns(rows)).toEqual({ header: 1, columns: { code: 1, title: 2, file: 3, level: 4, note: 5 } });
    expect(() => findColumns([["Tên bài", "Tệp nhạc"]])).toThrow(/Mã bài, Tên bài, Mức hay/);
    expect(plain(" Đã  Dùng ")).toBe("da dung");
    expect([isSheetName("Kho bài hát.xlsx"), isSheetName("kho bai hat.CSV"), isSheetName("Kho bài hát"), isSheetName("Kho bài hát", true), isSheetName("Nhạc.xlsx")]).toEqual([
      true,
      true,
      false,
      true,
      false,
    ]);
  });

  it("dòng thiếu mã / tên, mức sai, mã trùng → bỏ và báo số dòng; cột Dùng lại", () => {
    const { rows, problems } = parseSheet([
      ["Mã bài", "Tên bài", "Tệp nhạc", "Mức hay", "Dùng lại"],
      ["1", "Snow On Main Street", "1.wav", "3", ""],
      ["2", "Silent Night Waltz", "", "", "Thưa hơn"],
      ["", "Không mã", "x.wav", "2", ""],
      ["3", "Mức lạ", "3.wav", "7", ""],
      ["1", "Trùng mã", "9.wav", "1", ""],
      [],
      ["4", "Bỏ", "4.wav", "2", "Loại khỏi kho"],
    ]);
    expect(rows.map((r) => [r.code, r.level, r.file, r.reuse, r.excluded, r.row])).toEqual([
      ["1", 3, "1.wav", "normal", false, 2],
      ["2", 1, "", "less", false, 3],
      ["4", 2, "4.wav", "normal", true, 8],
    ]);
    expect(problems.map((p) => p.row)).toEqual([4, 5, 6]);
    expect(problems[2].message).toMatch(/trùng với dòng 2/);
  });
});

describe("kho nhạc = tệp Excel + Thư mục nhạc", () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "mvps-kho-"));
  const songs = path.join(tmp, "nhac");
  process.env.MV_DATA_DIR = path.join(tmp, "data");

  beforeAll(async () => {
    mkdirSync(path.join(songs, "Nhạc"), { recursive: true });
    const bin = (await import("@/lib/ffmpeg")).findFfmpeg().path!;
    const tone = (file: string, seconds: number) => {
      const r = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=330:duration=${seconds}`, "-c:a", "libmp3lame", file]);
      expect(r.status).toBe(0);
    };
    // Bài 1 có hai bản; bài 2 một bản (tên có "đã dùng" — không còn ý nghĩa); bài 3 chưa có trong tệp; bài theo tên nằm trong Nhạc\.
    tone(path.join(songs, "1.mp3"), 3);
    tone(path.join(songs, "1 (1).mp3"), 3);
    tone(path.join(songs, "2 đã dùng.mp3"), 4);
    tone(path.join(songs, "3.mp3"), 5);
    tone(path.join(songs, "Nhạc", "Jingle Swing.mp3"), 6);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Kho bài hát");
    ws.addRows([
      ["Mã bài", "Tên bài", "Tệp nhạc", "Mức hay"],
      ["1", "Snow On Main Street", "", 3],
      ["2", "Silent Night Waltz", "2 đã dùng.mp3", 2],
      ["B010", "Jingle Swing", "Nhạc\\Jingle Swing.mp3", "rất hay"],
      ["7", "Chưa có file", "", 2],
    ]);
    await wb.xlsx.writeFile(path.join(songs, "Kho bài hát.xlsx"));
  }, 60000);

  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("đọc mức, tên, các bản; bài chưa có trong tệp = mức 1; báo bài thiếu file", async () => {
    const { loadMusicLibrary } = await import("@/lib/musicLibrary");
    const lib = await loadMusicLibrary(songs);
    expect(lib.sheet).toBe(path.join(songs, "Kho bài hát.xlsx"));
    const by = new Map(lib.songs.map((s) => [s.code, s]));
    expect([by.get("1")!.title, by.get("1")!.level, by.get("1")!.versions.map((v) => v.name)]).toEqual(["Snow On Main Street", 3, ["1.mp3", "1 (1).mp3"]]);
    expect([by.get("2")!.level, by.get("2")!.versions.map((v) => v.name)]).toEqual([2, ["2 đã dùng.mp3"]]);
    expect([by.get("B010")!.level, by.get("B010")!.versions[0].name]).toEqual([3, "Jingle Swing.mp3"]);
    expect([by.get("3")!.level, by.get("3")!.inSheet, by.get("3")!.title]).toEqual([1, false, "Christmas Song No. 3"]);
    expect(by.get("7")!.exists).toBe(false);
    expect(lib.problems.map((p) => p.row)).toEqual([5]);
    expect(by.get("1")!.versions[0].duration).toBeCloseTo(3, 0);
  });

  it("CSV (dấu ; như Excel tiếng Việt) và tệp chỉ định trong Cài đặt", async () => {
    const { loadMusicLibrary } = await import("@/lib/musicLibrary");
    const csv = path.join(tmp, "kho.csv");
    writeFileSync(csv, "﻿Mã bài;Tên bài;Mức hay\r\n3;Carol Night;2\r\n");
    const lib = await loadMusicLibrary(songs, csv);
    const three = lib.songs.find((s) => s.code === "3")!;
    expect([three.title, three.level, three.inSheet]).toEqual(["Carol Night", 2, true]);
    // Bài 1, 2 không có trong tệp này: mức 1, tên theo thư viện lời / số bài.
    expect(lib.songs.find((s) => s.code === "1")!.level).toBe(1);
  });
});
